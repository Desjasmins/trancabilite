import "server-only";

// Socle commun des Server Actions. Ce module n'a PAS "use server" : avec la
// directive, chaque export (dont recordOperation) deviendrait un point d'entrée
// appelable depuis le client (doc Next 16, 01-directives/use-server.md).
import { prisma } from "@/lib/db";
import { EventResult } from "@/generated/prisma/client";
import { nextOp } from "@/lib/process";
import type { ZodError } from "zod";
import type {
  UnitDTO,
  BatchDTO,
  DeliveryDTO,
  SettingsDTO,
  LabelTemplate,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  units?: UnitDTO[];
  batches?: BatchDTO[];
  deliveries?: DeliveryDTO[];
  settings?: SettingsDTO;
  template?: LabelTemplate;
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

/** Message d'une exception levée par une transaction : message métier, sinon code GENERIC. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "GENERIC";
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
    data?: unknown;
    note?: string;
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({
      where: { id: unitId },
      include: { batch: { include: { route: { include: { steps: true } } } } },
    });
    if (!unit) throw new Error("Unité introuvable");
    if (unit.blocked) throw new Error("Unité bloquée (non conforme)");
    if (unit.currentOperationKey !== operationKey)
      throw new Error("Cette unité n'est pas à cette étape");

    const steps =
      unit.batch?.route?.steps
        ?.slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => s.operationKey) ?? [];

    const failed = opts.result === EventResult.fail;
    const next = failed ? unit.currentOperationKey : nextOp(steps, operationKey);

    await tx.traceEvent.create({
      data: {
        unitId,
        operationKey,
        result: opts.result,
        operator: opts.operator,
        data: (opts.data as object) ?? undefined,
        note: opts.note || null,
      },
    });

    const upd = await tx.unit.updateMany({
      where: { id: unitId, version: unit.version },
      data: {
        currentOperationKey: failed ? unit.currentOperationKey : next,
        blocked: failed,
        nc: failed ? opts.note || null : unit.nc,
        version: { increment: 1 },
      },
    });
    if (upd.count === 0) throw new Error("Conflit de concurrence, réessayez");
  });
}

/**
 * Remise en essai d'une unité non conforme réparée : événement `rework` au journal
 * (le refus reste intact), déblocage sous verrou de version. Partagée par l'action
 * d'atelier (opérateur choisi à l'écran) et celle du Bureau (nom de session, #3).
 */
export async function reworkUnit(unitId: string, operator: string, note: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new Error("Unité introuvable");
    if (!unit.blocked) throw new Error("Cette unité n'est pas bloquée");
    if (!unit.currentOperationKey) throw new Error("Unité sans étape courante");

    await tx.traceEvent.create({
      data: { unitId, operationKey: unit.currentOperationKey, result: EventResult.rework, operator, note: note || null },
    });

    const upd = await tx.unit.updateMany({
      where: { id: unitId, version: unit.version },
      data: { blocked: false, nc: null, version: { increment: 1 } },
    });
    if (upd.count === 0) throw new Error("Conflit de concurrence, réessayez");
  });
}
