"use server";

import { prisma } from "@/lib/db";
import { loadDeliveries } from "@/lib/queries";
import { createDeliverySchema, closeDeliverySchema } from "@/lib/schemas";
import { fail, failInvalid, errorText, type ActionResult } from "./_shared";
import { withAccess } from "@/lib/access/with-access";

/** Violation d'unicité Prisma (P2002) : la livraison existe déjà. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

async function createDelivery(input: unknown): Promise<ActionResult> {
  const parsed = createDeliverySchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { id, client } = parsed.data;

  try {
    // Création directe : la contrainte d'unicité tranche la course (#9). Un identifiant
    // existant (P2002) reste accepté tel quel, client et état inchangés.
    try {
      await prisma.delivery.create({ data: { id, client: client || null, closed: false } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
    return { ok: true, deliveries: await loadDeliveries() };
  } catch (e) {
    return fail(errorText(e));
  }
}

async function closeDelivery(input: unknown): Promise<ActionResult> {
  const parsed = closeDeliverySchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  try {
    // updateMany : un identifiant inconnu donne count 0 au lieu d'une P2025 brute (#9).
    const { count } = await prisma.delivery.updateMany({ where: { id: parsed.data.id }, data: { closed: true } });
    if (count === 0) return fail("DELIVERY_NOT_FOUND");
    return { ok: true, deliveries: await loadDeliveries() };
  } catch (e) {
    return fail(errorText(e));
  }
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
