import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { auth, type Role } from "@/lib/auth";
import type { Actor } from "./policy";

export type ActorMode = "render" | "action";

const ROLES: readonly string[] = ["admin", "superviseur", "client"] satisfies Role[];

type SessionUser = { id: string; name: string; email: string; role?: string | null; banned?: boolean | null };

function toRole(role: string | null | undefined): Role | null {
  return role && ROLES.includes(role) ? (role as Role) : null;
}

// `cache` (React) : une seule lecture de session par requête de rendu. La clé est le
// mode (primitive) : un objet neuf à chaque appel ne serait jamais retrouvé en cache.
const resolve = cache(async (mode: ActorMode): Promise<Actor> => {
  // Les deux modes ne font que LIRE (cookies() n'écrit pas au rendu, doc Next 16) ;
  // le #4 renouvellera le cookie d'écran en mode "action" seulement.
  void mode;
  const session = await auth.api.getSession({ headers: await headers() });
  const u = session?.user as SessionUser | undefined;
  // Better Auth 1.6 ne filtre pas les bannis dans getSession : on le fait ici.
  if (!u || u.banned === true) return { user: null };
  return { user: { id: u.id, name: u.name, email: u.email, role: toRole(u.role) } };
});

/** Acteur de la requête courante, résolu côté serveur. */
export function getActor({ mode }: { mode: ActorMode }): Promise<Actor> {
  return resolve(mode);
}
