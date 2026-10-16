"use server";

import { prisma } from "@/lib/db";
import { loadSettings, loadTemplate } from "@/lib/queries";
import { saveSettingsSchema, labelTemplateSchema } from "@/lib/schemas";
import { failInvalid, type ActionResult } from "./_shared";
import { withAccess } from "@/lib/access/with-access";

async function saveSettings(input: unknown): Promise<ActionResult> {
  const parsed = saveSettingsSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
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

async function saveTemplate(input: unknown): Promise<ActionResult> {
  const parsed = labelTemplateSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const data = parsed.data;

  await prisma.labelTemplate.upsert({
    where: { id: 1 },
    create: { id: 1, data },
    update: { data },
  });
  return { ok: true, template: await loadTemplate() };
}

// Points d'entrée : chaque export passe par la garde, politique lue dans POLICIES (#3).
const saveSettingsGuarded = withAccess("saveSettingsAction", saveSettings);
export async function saveSettingsAction(input: unknown): Promise<ActionResult> {
  return saveSettingsGuarded(input);
}
const saveTemplateGuarded = withAccess("saveTemplateAction", saveTemplate);
export async function saveTemplateAction(input: unknown): Promise<ActionResult> {
  return saveTemplateGuarded(input);
}
