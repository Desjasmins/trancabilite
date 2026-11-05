import "server-only";

// Socle commun des Server Actions. Ce module n'a PAS "use server" : avec la
// directive, chaque export (dont recordOperation) deviendrait un point d'entrée
// appelable depuis le client (doc Next 16, 01-directives/use-server.md).
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { EventResult } from "@/generated/prisma/client";
import { nextOp } from "@/lib/process";
import type { ZodError } from "zod";
import type {
  UnitDTO,
  BatchDTO,
  DeliveryDTO,
  SettingsDTO,
  LabelTemplate,
  KioskDTO,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  units?: UnitDTO[];
  batches?: BatchDTO[];
  deliveries?: DeliveryDTO[];
  settings?: SettingsDTO;
  template?: LabelTemplate;
  kiosks?: KioskDTO[];
  createdIds?: string[];
  doneCount?: number;
  failCount?: number;
}

export function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Entrée refusée par Zod : premier message du schéma. Zod rend toujours au moins un
 *  problème, d'où l'absence de repli (les anciens `?? "Entrée invalide"` étaient morts, D15). */
export function failInvalid(error: ZodError): ActionResult {
  return fail(error.issues[0].message);
}

/** Refus métier levé par NOTRE code : son message peut être montré à l'utilisateur. */
export class BusinessError extends Error {}

/**
 * Message d'une exception levée pendant une action. Seul un refus métier (BusinessError)
 * passe ; toute autre erreur (Prisma, réseau…) peut divulguer des détails internes :
 * journal serveur seulement, code GENERIC au client (revue #3).
 */
export function errorText(e: unknown): string {
  if (e instanceof BusinessError) return e.message;
  console.error("[action]", e);
  return "GENERIC";
}

/**
 * Heure lue côté base DANS la transaction (#19) : `clock_timestamp()` avance pendant la
 * transaction, contrairement à `now()` (heure de son début). Jamais l'horloge de Node :
 * aucune heure valide → l'erreur remonte et la transaction est annulée.
 */
export async function dbNow(tx: Pick<Prisma.TransactionClient, "$queryRaw">): Promise<Date> {
  const rows = await tx.$queryRaw<{ t: Date | string }[]>`SELECT clock_timestamp() AS t`;
  const t = rows[0] ? new Date(rows[0].t) : null;
  if (!t || Number.isNaN(t.getTime())) throw new Error(`clock_timestamp() n'a rendu aucune heure valide : ${String(rows[0]?.t)}`);
  return t;
}

/** Horodatage du couple renvoi (#19, utilisé par T2) : `fail` à t, `rework` à t + 1 ms. */
export function pairTimestamps(t: Date): { failAt: Date; reworkAt: Date } {
  return { failAt: new Date(t.getTime()), reworkAt: new Date(t.getTime() + 1) };
}

/**
 * Transition transactionnelle : insère un événement immuable et avance la gamme.
 * Garde (étape attendue), idempotence (re-scan) et verrou optimiste (version).
 */
export async function recordOperation(
  unitId: string,
  operationKey: string,
  opts: {
    operator: string;
    result: EventResult;
    data?: Prisma.InputJsonObject;
    note?: string;
    /** Kiosk.id de l'écran appairé (#4) ; null = écran non identifié. */
    stationId?: string | null;
    /**
     * Renvoi (#21) : avec un `fail`, écrit aussi un `rework` vers `step` (qui doit précéder
     * l'étape dans la gamme) et remet l'unité à cette étape, NON bloquée.
     */
    reworkTo?: { step: string; cause: string };
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({
      where: { id: unitId },
      include: { batch: { include: { route: { include: { steps: true } } } } },
    });
    if (!unit) throw new BusinessError("Unité introuvable");
    if (unit.blocked) throw new BusinessError("Unité bloquée (non conforme)");
    if (unit.currentOperationKey !== operationKey)
      throw new BusinessError("Cette unité n'est pas à cette étape");

    const steps =
      unit.batch?.route?.steps
        ?.slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => s.operationKey) ?? [];

    const failed = opts.result === EventResult.fail;
    const note = opts.note || null;
    const stationId = opts.stationId ?? null;
    const base = { unitId, operationKey, operator: opts.operator, note, stationId };
    const rework = failed ? opts.reworkTo : undefined;

    let state: { currentOperationKey: string | null; blocked: boolean; nc: string | null };
    if (rework) {
      // Garde de cible (#21, B3) : l'étape de reprise doit précéder l'étape courante.
      const to = steps.indexOf(rework.step);
      if (to < 0 || to >= steps.indexOf(operationKey))
        throw new BusinessError("REWORK_TARGET_INVALID"); // code traduit côté client (#21)
      // Couple fail → rework horodaté depuis l'heure de la base (#19, B1).
      const { failAt, reworkAt } = pairTimestamps(await dbNow(tx));
      await tx.traceEvent.create({
        data: { ...base, result: EventResult.fail, data: opts.data, createdAt: failAt },
      });
      await tx.traceEvent.create({
        data: { ...base, result: EventResult.rework, data: { to: rework.step, cause: rework.cause }, createdAt: reworkAt },
      });
      // La branche « bloquée » ne s'applique pas à un renvoi : la reprise se fait au Montage.
      state = { currentOperationKey: rework.step, blocked: false, nc: note };
    } else {
      await tx.traceEvent.create({
        data: { ...base, result: opts.result, data: opts.data },
      });
      // Échec : bloquée avec sa NC. Réussite (done/pass) : plus de non-conformité, nc remis à null (#21).
      state = failed
        ? { currentOperationKey: unit.currentOperationKey, blocked: true, nc: note }
        : { currentOperationKey: nextOp(steps, operationKey), blocked: false, nc: null };
    }

    // Une seule mise à jour versionnée : en cas de conflit, la transaction annule tous les événements.
    const upd = await tx.unit.updateMany({
      where: { id: unitId, version: unit.version },
      data: { ...state, version: { increment: 1 } },
    });
    if (upd.count === 0) throw new BusinessError("Conflit de concurrence, réessayez");
  });
}

/**
 * Remise en essai d'une unité non conforme réparée : événement `rework` au journal
 * (le refus reste intact), déblocage sous verrou de version. Partagée par l'action
 * d'atelier (opérateur choisi à l'écran) et celle du Bureau (nom de session, #3).
 * `stationId` : écran appairé d'où vient l'appel, quel que soit le compte (#4, B2).
 */
export async function reworkUnit(
  unitId: string,
  operator: string,
  note: string,
  stationId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new BusinessError("Unité introuvable");
    if (!unit.blocked) throw new BusinessError("Cette unité n'est pas bloquée");
    if (!unit.currentOperationKey) throw new BusinessError("Unité sans étape courante");

    await tx.traceEvent.create({
      data: { unitId, operationKey: unit.currentOperationKey, result: EventResult.rework, operator, note: note || null, stationId },
    });

    const upd = await tx.unit.updateMany({
      where: { id: unitId, version: unit.version },
      data: { blocked: false, nc: null, version: { increment: 1 } },
    });
    if (upd.count === 0) throw new BusinessError("Conflit de concurrence, réessayez");
  });
}
