"use server";

import { prisma } from "@/lib/db";
import { EventResult, Prisma } from "@/generated/prisma/client";
import { loadUnits, loadBatches } from "@/lib/queries";
import { nextSerial } from "@/lib/status";
import { pad } from "@/lib/label";
import { createBatchSchema, updateBatchSchema, reprintPrintedSchema, type CreateBatchInput } from "@/lib/schemas";
import { fail, failInvalid, errorText, BusinessError, type ActionResult } from "./_shared";
import { withAccess } from "@/lib/access/with-access";

type Tx = Prisma.TransactionClient;

/** Gamme : celle demandée, sinon la gamme par défaut, sinon n'importe laquelle. */
async function resolveRoute(tx: Tx, routeId?: string) {
  const include = { steps: true } as const;
  return (
    (routeId ? await tx.route.findUnique({ where: { id: routeId }, include }) : null) ??
    (await tx.route.findFirst({ where: { isDefault: true }, include })) ??
    (await tx.route.findFirst({ include }))
  );
}

/**
 * Premier S.N. libre pour (projet, référence), lu DANS la transaction et sous verrou.
 * Le verrou consultatif (relâché au COMMIT/ROLLBACK) sérialise les créations concurrentes
 * du même couple : la seconde relit la base après le COMMIT de la première (#7). Le cache
 * client (loadUnits) n'est pas une source : il ignore les unités en cours de création.
 */
async function firstFreeSerial(tx: Tx, d: CreateBatchInput): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${d.projet}::text || '|' || ${d.reference}::text))`;
  const same = await tx.unit.findMany({
    where: { projet: d.projet, reference: d.reference },
    select: { projet: true, reference: true, serie: true },
  });
  return nextSerial(same, d.projet, d.reference, d.start);
}

/** Lot + unités en une seule transaction : un échec n'écrit rien (pas de lot orphelin). */
async function insertBatch(tx: Tx, d: CreateBatchInput): Promise<string[]> {
  const route = await resolveRoute(tx, d.routeId);
  const firstOpKey =
    route?.steps.slice().sort((a, b) => a.position - b.position)[0]?.operationKey ?? "montage";
  const n = await firstFreeSerial(tx, d);
  const batch = await tx.batch.create({
    data: {
      po: d.po || null, projet: d.projet, reference: d.reference, sub: d.sub || null,
      createdBy: d.operator || null, routeId: route?.id ?? null,
    },
  });
  const now = new Date();
  const rows = await tx.unit.createManyAndReturn({
    data: Array.from({ length: d.qty }, (_v, i) => ({
      serie: pad(n + i), projet: d.projet, reference: d.reference, po: d.po || null,
      sub: d.sub || null, batchId: batch.id, etiquettePar: d.operator || null,
      etiquetteDate: now, etiquetteImprimee: false, currentOperationKey: firstOpKey,
    })),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Violation d'unicité (projet, référence, S.N.) : refus lisible, traduit côté client. */
function batchErrorText(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "SERIAL_TAKEN";
  return errorText(e);
}

/** Crée un lot (selon une gamme) + N unités. Retourne les unités fraîches. */
async function createBatch(input: unknown): Promise<ActionResult> {
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  let createdIds: string[];
  try {
    // 500 unités au plus (schéma) : délai relevé au-delà des 5 s par défaut de Prisma.
    createdIds = await prisma.$transaction((tx) => insertBatch(tx, parsed.data), { timeout: 20_000 });
  } catch (e) {
    return fail(batchErrorText(e));
  }
  return { ok: true, units: await loadUnits(), batches: await loadBatches(), createdIds };
}

/**
 * Modifie un lot après coup (PO, projet, référence, sous-traitant, gamme).
 * Les champs copiés sur les unités sont propagés. Si la gamme change, l'étape
 * courante de chaque unité est RECALCULÉE depuis son journal d'événements
 * (première opération de la nouvelle gamme sans événement réussi). Les unités
 * bloquées (non conformes) ou déjà livrées ne sont pas déplacées.
 */
async function updateBatch(input: unknown): Promise<ActionResult> {
  const parsed = updateBatchSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const d = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: d.batchId },
        include: { units: { include: { events: true } } },
      });
      if (!batch) throw new BusinessError("Lot introuvable");

      const route = await tx.route.findUnique({
        where: { id: d.routeId },
        include: { steps: true },
      });
      if (!route) throw new BusinessError("Gamme introuvable");
      const steps = route.steps
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => s.operationKey);

      await tx.batch.update({
        where: { id: batch.id },
        data: {
          po: d.po || null,
          projet: d.projet,
          reference: d.reference,
          sub: d.sub || null,
          routeId: route.id,
        },
      });

      const routeChanged = batch.routeId !== route.id;

      for (const u of batch.units) {
        const data: {
          projet: string;
          reference: string;
          po: string | null;
          sub: string | null;
          currentOperationKey?: string | null;
          version?: { increment: number };
        } = {
          projet: d.projet,
          reference: d.reference,
          po: d.po || null,
          sub: d.sub || null,
        };
        if (routeChanged && !u.blocked && !u.deliveryId) {
          const done = new Set(
            u.events
              .filter((e) => e.result === EventResult.done || e.result === EventResult.pass)
              .map((e) => e.operationKey),
          );
          data.currentOperationKey = steps.find((k) => !done.has(k)) ?? null;
          data.version = { increment: 1 };
        }
        await tx.unit.update({ where: { id: u.id }, data });
      }
    });
  } catch (e) {
    // Changer projet/référence peut heurter l'unicité des S.N. (#7) : même refus lisible.
    return fail(batchErrorText(e));
  }
  return { ok: true, units: await loadUnits(), batches: await loadBatches() };
}

async function markPrinted(input: unknown): Promise<ActionResult> {
  const parsed = reprintPrintedSchema.safeParse(input);
  if (!parsed.success) return fail("Entrée invalide");
  await prisma.unit.updateMany({
    where: { id: { in: parsed.data.unitIds } },
    data: { etiquetteImprimee: true },
  });
  return { ok: true, units: await loadUnits() };
}

// Points d'entrée : chaque export passe par la garde, politique lue dans POLICIES (#3).
const createBatchGuarded = withAccess("createBatchAction", createBatch);
export async function createBatchAction(input: unknown): Promise<ActionResult> {
  return createBatchGuarded(input);
}
const updateBatchGuarded = withAccess("updateBatchAction", updateBatch);
export async function updateBatchAction(input: unknown): Promise<ActionResult> {
  return updateBatchGuarded(input);
}
const markPrintedGuarded = withAccess("markPrintedAction", markPrinted);
export async function markPrintedAction(input: unknown): Promise<ActionResult> {
  return markPrintedGuarded(input);
}
