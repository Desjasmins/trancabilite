"use server";

import { prisma } from "@/lib/db";
import { loadDeliveries } from "@/lib/queries";
import { createDeliverySchema, closeDeliverySchema } from "@/lib/schemas";
import { fail, type ActionResult } from "./_shared";

export async function createDeliveryAction(input: unknown): Promise<ActionResult> {
  const parsed = createDeliverySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { id, client } = parsed.data;

  const existing = await prisma.delivery.findUnique({ where: { id } });
  if (!existing) {
    await prisma.delivery.create({ data: { id, client: client || null, closed: false } });
  }
  return { ok: true, deliveries: await loadDeliveries() };
}

export async function closeDeliveryAction(input: unknown): Promise<ActionResult> {
  const parsed = closeDeliverySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  await prisma.delivery.update({ where: { id: parsed.data.id }, data: { closed: true } });
  return { ok: true, deliveries: await loadDeliveries() };
}
