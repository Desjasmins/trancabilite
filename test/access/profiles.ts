import { sessionFor, type MockSession } from "../mocks/auth";
import type { Actor } from "@/lib/access/policy";

/**
 * Les six profils de la matrice (#3) : la session que Better Auth rendrait, et l'acteur
 * que `getActor` doit en tirer. Le banni et le rôle inconnu sont des sessions VALIDES :
 * c'est notre code, pas Better Auth, qui leur retire tout droit (PLAN, point b).
 */
/** Aucun cookie d'écran (#4). */
export const NO_KIOSK = { kiosk: null, kioskRevoked: false } as const;

export type ProfileName = "anonyme" | "inconnu" | "banni" | "client" | "superviseur" | "admin";

const user = (id: string, name: string, role: string | null, banned = false) =>
  ({ id, name, email: `${id}@test.invalid`, role, banned });

export const PROFILES: Record<ProfileName, { session: MockSession; actor: Actor }> = {
  anonyme: { session: null, actor: { user: null, ...NO_KIOSK } },
  inconnu: {
    session: sessionFor(user("u-inconnu", "Ivo", "operateur")),
    actor: { user: { id: "u-inconnu", name: "Ivo", email: "u-inconnu@test.invalid", role: null }, ...NO_KIOSK },
  },
  banni: { session: sessionFor(user("u-banni", "Bob", "admin", true)), actor: { user: null, ...NO_KIOSK } },
  client: {
    session: sessionFor(user("u-client", "Cléo", "client")),
    actor: { user: { id: "u-client", name: "Cléo", email: "u-client@test.invalid", role: "client" }, ...NO_KIOSK },
  },
  superviseur: {
    session: sessionFor(user("u-sup", "Sam", "superviseur")),
    actor: { user: { id: "u-sup", name: "Sam", email: "u-sup@test.invalid", role: "superviseur" }, ...NO_KIOSK },
  },
  admin: {
    session: sessionFor(user("u-admin", "Ada", "admin")),
    actor: { user: { id: "u-admin", name: "Ada", email: "u-admin@test.invalid", role: "admin" }, ...NO_KIOSK },
  },
};

export const PROFILE_NAMES = Object.keys(PROFILES) as ProfileName[];
