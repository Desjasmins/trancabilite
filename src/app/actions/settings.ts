"use server";

import { prisma } from "@/lib/db";
import { loadSettings, loadTemplate } from "@/lib/queries";
import { saveSettingsSchema, labelTemplateSchema } from "@/lib/schemas";
import { fail, type ActionResult } from "./_shared";

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
