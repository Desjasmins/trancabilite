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

/** Levée dans la transaction quand un écran actif porte déjà le libellé (annule tout). */
class LabelTaken extends Error {}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Deux écrans actifs ne portent jamais le même nom (tour 2) ; `exceptId` = l'écran renommé. */
async function assertLabelFree(tx: Tx, label: string, exceptId?: string): Promise<void> {
  const clash = await tx.kiosk.findFirst({
    where: { label, revokedAt: null, ...(exceptId && { NOT: { id: exceptId } }) },
  });
  if (clash) throw new LabelTaken();
}

/**
 * Appaire l'écran d'où vient l'appel (#4), admin connecté. Ré-appairage : le Kiosk du cookie
 * courant (s'il est actif) est révoqué et le nouveau créé dans la même transaction (NB2).
 * Le cookie n'est posé qu'après la transaction : un échec laisse l'écran tel qu'il était.
 * Le nom est vérifié après la révocation : ré-appairer sous son propre nom reste permis.
 */
async function pairKiosk(input: unknown, actor: Actor): Promise<ActionResult> {
  const parsed = pairKioskSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const jar = await cookies();
  const name = kioskCookieName();
  const previous = jar.get(name)?.value;
  const token = newKioskToken();
  try {
    await pairInTransaction(previous, token, parsed.data.label, actor.user!.id);
  } catch (e) {
    if (e instanceof LabelTaken) return fail("KIOSK_LABEL_TAKEN");
    throw e;
  }
  jar.set(name, token, kioskCookieOptions());
  return kiosksResult();
}

async function pairInTransaction(previous: string | undefined, token: string, label: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    if (previous) {
      await tx.kiosk.updateMany({
        where: { tokenHash: hashKioskToken(previous), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await assertLabelFree(tx, label);
    await tx.kiosk.create({ data: { label, tokenHash: hashKioskToken(token), createdById: userId } });
  });
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
  const { id, label } = parsed.data;
  try {
    const { count } = await prisma.$transaction(async (tx) => {
      await assertLabelFree(tx, label, id);
      return tx.kiosk.updateMany({ where: { id }, data: { label } });
    });
    if (count === 0) return fail("KIOSK_NOT_FOUND");
  } catch (e) {
    if (e instanceof LabelTaken) return fail("KIOSK_LABEL_TAKEN");
    throw e;
  }
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
