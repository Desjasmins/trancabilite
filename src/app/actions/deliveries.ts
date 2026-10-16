"use server";

import { prisma } from "@/lib/db";
import { loadDeliveries } from "@/lib/queries";
import { createDeliverySchema, closeDeliverySchema } from "@/lib/schemas";
import { failInvalid, type ActionResult } from "./_shared";
import { withAccess } from "@/lib/access/with-access";

async function createDelivery(input: unknown): Promise<ActionResult> {
  const parsed = createDeliverySchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { id, client } = parsed.data;

  const existing = await prisma.delivery.findUnique({ where: { id } });
  if (!existing) {
    await prisma.delivery.create({ data: { id, client: client || null, closed: false } });
  }
  return { ok: true, deliveries: await loadDeliveries() };
}

async function closeDelivery(input: unknown): Promise<ActionResult> {
  const parsed = closeDeliverySchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  await prisma.delivery.update({ where: { id: parsed.data.id }, data: { closed: true } });
  return { ok: true, deliveries: await loadDeliveries() };
}

// Points d'entrée : chaque export passe par la garde, politique lue dans POLICIES (#3).
const createDeliveryGuarded = withAccess("createDeliveryAction", createDelivery);
export async function createDeliveryAction(input: unknown): Promise<ActionResult> {
  return createDeliveryGuarded(input);
}
const closeDeliveryGuarded = withAccess("closeDeliveryAction", closeDelivery);
export async function closeDeliveryAction(input: unknown): Promise<ActionResult> {
  return closeDeliveryGuarded(input);
}
