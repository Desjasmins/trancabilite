import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth, type Role } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Actor } from "./policy";
import { hashKioskToken, kioskCookieName, kioskCookieOptions, KIOSK_SEEN_EVERY_MS } from "./kiosk";

export type ActorMode = "render" | "action";

const ROLES: readonly string[] = ["admin", "superviseur", "client"] satisfies Role[];

type SessionUser = { id: string; name: string; email: string; role?: string | null; banned?: boolean | null };

function toRole(role: string | null | undefined): Role | null {
  return role && ROLES.includes(role) ? (role as Role) : null;
}

type CookieJar = Awaited<ReturnType<typeof cookies>>;
type KioskPart = Pick<Actor, "kiosk" | "kioskRevoked">;
const NO_KIOSK: KioskPart = { kiosk: null, kioskRevoked: false };

/**
 * Écran d'atelier désigné par le cookie (#4). Cookie absent ou inconnu → aucun écran (§13) ;
 * Kiosk révoqué → `kioskRevoked`. En mode "action" seulement, `lastSeenAt` et le cookie sont
 * renouvelés au plus une fois par 5 min : `cookies().set` est interdit au rendu (doc Next 16).
 */
async function readKiosk(jar: CookieJar, mode: ActorMode): Promise<KioskPart> {
  const name = kioskCookieName();
  const token = jar.get(name)?.value;
  if (!token) return NO_KIOSK;
  const row = await prisma.kiosk.findUnique({ where: { tokenHash: hashKioskToken(token) } });
  if (!row) return NO_KIOSK;
  if (row.revokedAt) return { kiosk: null, kioskRevoked: true };
  const stale = !row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > KIOSK_SEEN_EVERY_MS;
  if (mode === "action" && stale) {
    await prisma.kiosk.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } });
    jar.set(name, token, kioskCookieOptions());
  }
  return { kiosk: { id: row.id, label: row.label }, kioskRevoked: false };
}

// `cache` (React) : une seule lecture par requête de rendu. La clé est le mode (primitive) :
// un objet neuf à chaque appel ne serait jamais retrouvé en cache.
const resolve = cache(async (mode: ActorMode): Promise<Actor> => {
  const session = await auth.api.getSession({ headers: await headers() });
  const kiosk = await readKiosk(await cookies(), mode);
  const u = session?.user as SessionUser | undefined;
  // Better Auth 1.6 ne filtre pas les bannis dans getSession : on le fait ici.
  if (!u || u.banned === true) return { user: null, ...kiosk };
  return { user: { id: u.id, name: u.name, email: u.email, role: toRole(u.role) }, ...kiosk };
});

/** Acteur de la requête courante, résolu côté serveur. */
export function getActor({ mode }: { mode: ActorMode }): Promise<Actor> {
  return resolve(mode);
}
