"use server";

import { prisma } from "@/lib/db";
import { EventResult } from "@/generated/prisma/client";
import { loadUnits, loadBatches } from "@/lib/queries";
import { nextSerial } from "@/lib/status";
import { pad } from "@/lib/label";
import { createBatchSchema, updateBatchSchema, reprintPrintedSchema } from "@/lib/schemas";
import { fail, type ActionResult } from "./_shared";

/** Crée un lot (selon une gamme) + N unités. Retourne les unités fraîches. */
export async function createBatchAction(input: unknown): Promise<ActionResult> {
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const d = parsed.data;

  // Gamme : celle demandée, sinon la gamme par défaut, sinon n'importe laquelle.
  const route =
    (d.routeId
      ? await prisma.route.findUnique({ where: { id: d.routeId }, include: { steps: true } })
      : null) ??
    (await prisma.route.findFirst({
      where: { isDefault: true },
      include: { steps: true },
    })) ??
    (await prisma.route.findFirst({ include: { steps: true } }));

  const steps =
    route?.steps?.slice().sort((a, b) => a.position - b.position).map((s) => s.operationKey) ?? [];
  const firstOpKey = steps[0] ?? "montage";

  const current = await loadUnits();
  let n = nextSerial(current, d.projet, d.reference, d.start);

  const batch = await prisma.batch.create({
    data: {
      po: d.po || null,
      projet: d.projet,
      reference: d.reference,
      sub: d.sub || null,
      createdBy: d.operator || null,
      routeId: route?.id ?? null,
    },
  });

  const createdIds: string[] = [];
  await prisma
    .$transaction(
      Array.from({ length: d.qty }).map(() => {
        const serie = pad(n++);
        return prisma.unit.create({
          data: {
            serie,
            projet: d.projet,
            reference: d.reference,
            po: d.po || null,
            sub: d.sub || null,
            batchId: batch.id,
            etiquettePar: d.operator || null,
            etiquetteDate: new Date(),
            etiquetteImprimee: false,
            currentOperationKey: firstOpKey,
          },
          select: { id: true },
        });
      }),
    )
    .then((rows) => rows.forEach((r) => createdIds.push(r.id)));

  return { ok: true, units: await loadUnits(), batches: await loadBatches(), createdIds };
}

/**
 * Modifie un lot après coup (PO, projet, référence, sous-traitant, gamme).
 * Les champs copiés sur les unités sont propagés. Si la gamme change, l'étape
 * courante de chaque unité est RECALCULÉE depuis son journal d'événements
 * (première opération de la nouvelle gamme sans événement réussi). Les unités
 * bloquées (non conformes) ou déjà livrées ne sont pas déplacées.
 */
export async function updateBatchAction(input: unknown): Promise<ActionResult> {
  const parsed = updateBatchSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const d = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: d.batchId },
        include: { units: { include: { events: true } } },
      });
      if (!batch) throw new Error("Lot introuvable");

      const route = await tx.route.findUnique({
        where: { id: d.routeId },
        include: { steps: true },
      });
      if (!route) throw new Error("Gamme introuvable");
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
    return fail(e instanceof Error ? e.message : "Erreur");
  }
  return { ok: true, units: await loadUnits(), batches: await loadBatches() };
}

export async function markPrintedAction(input: unknown): Promise<ActionResult> {
  const parsed = reprintPrintedSchema.safeParse(input);
  if (!parsed.success) return fail("Entrée invalide");
  await prisma.unit.updateMany({
    where: { id: { in: parsed.data.unitIds } },
    data: { etiquetteImprimee: true },
  });
  return { ok: true, units: await loadUnits() };
}
