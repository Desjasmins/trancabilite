"use server";

import { prisma } from "@/lib/db";
import {
  loadUnits,
  loadDeliveries,
  loadSettings,
  loadTemplate,
} from "@/lib/queries";
import { nextSerial, statut } from "@/lib/status";
import { pad } from "@/lib/label";
import {
  createBatchSchema,
  confirmMontageSchema,
  confirmTestSchema,
  confirmVerifSchema,
  packUnitSchema,
  createDeliverySchema,
  closeDeliverySchema,
  saveSettingsSchema,
  labelTemplateSchema,
  reprintPrintedSchema,
} from "@/lib/schemas";
import type {
  UnitDTO,
  DeliveryDTO,
  SettingsDTO,
  LabelTemplate,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  units?: UnitDTO[];
  deliveries?: DeliveryDTO[];
  settings?: SettingsDTO;
  template?: LabelTemplate;
  createdIds?: string[];
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Crée un lot + N unités, retourne les unités fraîches et les ids créés. */
export async function createBatchAction(input: unknown): Promise<ActionResult> {
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const d = parsed.data;

  const current = await loadUnits();
  let n = nextSerial(current, d.projet, d.reference, d.start);

  const batch = await prisma.batch.create({
    data: {
      po: d.po || null,
      projet: d.projet,
      reference: d.reference,
      sub: d.sub || null,
      createdBy: d.operator || null,
    },
  });

  const createdIds: string[] = [];
  await prisma.$transaction(
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
        },
        select: { id: true },
      });
    }),
  ).then((rows) => rows.forEach((r) => createdIds.push(r.id)));

  return { ok: true, units: await loadUnits(), createdIds };
}

export async function confirmMontageAction(input: unknown): Promise<ActionResult> {
  const parsed = confirmMontageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitId, operator } = parsed.data;

  const u = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!u) return fail("Unité introuvable");
  await prisma.unit.update({
    where: { id: unitId },
    data: { montagePar: operator, montageDate: new Date() },
  });
  return { ok: true, units: await loadUnits() };
}

export async function confirmTestAction(input: unknown): Promise<ActionResult> {
  const parsed = confirmTestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitId, operator, diel, pol, eff, nc } = parsed.data;

  const u = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!u) return fail("Unité introuvable");
  const rejected = [diel, pol, eff].includes("refus");
  await prisma.unit.update({
    where: { id: unitId },
    data: {
      testPar: operator,
      testDate: new Date(),
      testDiel: diel,
      testPol: pol,
      testEff: eff,
      nc: rejected ? nc || null : null,
    },
  });
  return { ok: true, units: await loadUnits() };
}

export async function confirmVerifAction(input: unknown): Promise<ActionResult> {
  const parsed = confirmVerifSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitId, operator } = parsed.data;

  const u = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!u) return fail("Unité introuvable");
  await prisma.unit.update({
    where: { id: unitId },
    data: { verificationPar: operator, verificationDate: new Date() },
  });
  return { ok: true, units: await loadUnits() };
}

export async function packUnitAction(input: unknown): Promise<ActionResult> {
  const parsed = packUnitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitId, deliveryId } = parsed.data;

  const units = await loadUnits();
  const u = units.find((x) => x.id === unitId);
  if (!u) return fail("Unité introuvable");
  if (statut(u) !== "pret") return fail("Unité non prête à emballer");

  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return fail("Livraison introuvable");

  await prisma.unit.update({
    where: { id: unitId },
    data: { deliveryId },
  });
  return { ok: true, units: await loadUnits() };
}

export async function createDeliveryAction(input: unknown): Promise<ActionResult> {
  const parsed = createDeliverySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { id, client } = parsed.data;

  const existing = await prisma.delivery.findUnique({ where: { id } });
  if (!existing) {
    await prisma.delivery.create({
      data: { id, client: client || null, closed: false },
    });
  }
  return { ok: true, deliveries: await loadDeliveries() };
}

export async function closeDeliveryAction(input: unknown): Promise<ActionResult> {
  const parsed = closeDeliverySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  await prisma.delivery.update({
    where: { id: parsed.data.id },
    data: { closed: true },
  });
  return { ok: true, deliveries: await loadDeliveries() };
}

export async function saveSettingsAction(input: unknown): Promise<ActionResult> {
  const parsed = saveSettingsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { sub, proj, ops } = parsed.data;

  await prisma.$transaction([
    prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, sub, proj },
      update: { sub, proj },
    }),
    prisma.operator.deleteMany({}),
    ...ops.map((name, i) =>
      prisma.operator.create({ data: { name, order: i, active: true } }),
    ),
  ]);
  return { ok: true, settings: await loadSettings() };
}

export async function saveTemplateAction(input: unknown): Promise<ActionResult> {
  const parsed = labelTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Gabarit invalide");
  const data = parsed.data;

  await prisma.labelTemplate.upsert({
    where: { id: 1 },
    create: { id: 1, data },
    update: { data },
  });
  return { ok: true, template: await loadTemplate() };
}

/** Marque des étiquettes comme imprimées (trace l'impression). */
export async function markPrintedAction(input: unknown): Promise<ActionResult> {
  const parsed = reprintPrintedSchema.safeParse(input);
  if (!parsed.success) return fail("Entrée invalide");
  await prisma.unit.updateMany({
    where: { id: { in: parsed.data.unitIds } },
    data: { etiquetteImprimee: true },
  });
  return { ok: true, units: await loadUnits() };
}
