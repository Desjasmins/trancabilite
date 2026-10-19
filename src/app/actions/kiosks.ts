"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { toKioskDTO } from "@/lib/mappers";
import { pairKioskSchema, revokeKioskSchema, renameKioskSchema } from "@/lib/schemas";
import { hashKioskToken, kioskCookieName, kioskCookieOptions, newKioskToken } from "@/lib/access/kiosk";
import { withAccess } from "@/lib/access/with-access";
import type { Actor } from "@/lib/access/policy";
import { fail, failInvalid, type ActionResult } from "./_shared";

/** Écrans du plus récent au plus ancien, révoqués compris (jamais supprimés). */
async function kiosksResult(): Promise<ActionResult> {
  const rows = await prisma.kiosk.findMany({ orderBy: { createdAt: "desc" } });
  return { ok: true, kiosks: rows.map(toKioskDTO) };
}

/**
 * Appaire l'écran d'où vient l'appel (#4), admin connecté. Ré-appairage : le Kiosk du cookie
 * courant (s'il est actif) est révoqué et le nouveau créé dans la même transaction (NB2).
 * Le cookie n'est posé qu'après la transaction : un échec laisse l'écran tel qu'il était.
 */
async function pairKiosk(input: unknown, actor: Actor): Promise<ActionResult> {
  const parsed = pairKioskSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const jar = await cookies();
  const name = kioskCookieName();
  const previous = jar.get(name)?.value;
  const token = newKioskToken();
  await prisma.$transaction(async (tx) => {
    if (previous) {
      await tx.kiosk.updateMany({
        where: { tokenHash: hashKioskToken(previous), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    // ADMIN_WRITE garantit un utilisateur.
    await tx.kiosk.create({
      data: { label: parsed.data.label, tokenHash: hashKioskToken(token), createdById: actor.user!.id },
    });
  });
  jar.set(name, token, kioskCookieOptions());
  return kiosksResult();
}

/** Retire l'accès d'un écran. Idempotent : la date de la première révocation est gardée. */
async function revokeKiosk(input: unknown): Promise<ActionResult> {
  const parsed = revokeKioskSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  await prisma.kiosk.updateMany({ where: { id: parsed.data.id, revokedAt: null }, data: { revokedAt: new Date() } });
  return kiosksResult();
}

async function renameKiosk(input: unknown): Promise<ActionResult> {
  const parsed = renameKioskSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { count } = await prisma.kiosk.updateMany({ where: { id: parsed.data.id }, data: { label: parsed.data.label } });
  if (count === 0) return fail("Écran introuvable");
  return kiosksResult();
}

async function listKiosks(): Promise<ActionResult> {
  return kiosksResult();
}

// Points d'entrée : chaque export passe par la garde, politique lue dans POLICIES.
const pairKioskGuarded = withAccess("pairKioskAction", pairKiosk);
export async function pairKioskAction(input: unknown): Promise<ActionResult> {
  return pairKioskGuarded(input);
}
const revokeKioskGuarded = withAccess("revokeKioskAction", revokeKiosk);
export async function revokeKioskAction(input: unknown): Promise<ActionResult> {
  return revokeKioskGuarded(input);
}
const renameKioskGuarded = withAccess("renameKioskAction", renameKiosk);
export async function renameKioskAction(input: unknown): Promise<ActionResult> {
  return renameKioskGuarded(input);
}
const listKiosksGuarded = withAccess("listKiosksAction", listKiosks);
export async function listKiosksAction(): Promise<ActionResult> {
  return listKiosksGuarded(undefined);
}
