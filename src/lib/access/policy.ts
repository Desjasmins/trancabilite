import type { Role } from "@/lib/auth";

/**
 * Contrôle d'accès des Server Actions (#3) — partie pure, sans I/O.
 * Le #4 ajoutera l'écran d'atelier (`kiosk`) à l'acteur et FLOOR_WRITE / READ / ADMIN_WRITE.
 */
export interface ActorUser {
  id: string;
  name: string;
  email: string;
  /** Rôle hors {admin, superviseur, client} → null : aucun droit. */
  role: Role | null;
}

export interface Actor {
  user: ActorUser | null;
}

/**
 * OPEN_UNTIL_KIOSK : TEMPORAIRE. Les actions d'atelier restent ouvertes tant que l'écran
 * d'atelier n'est pas identifié (modèle Kiosk, #4). Le nom le dit pour qu'on ne l'oublie pas.
 */
export type Policy = "STAFF_WRITE" | "OPEN_UNTIL_KIOSK";

// Pas de `default` : ajouter une politique sans la traiter ici est une erreur de type
// (« la fonction n'a pas d'instruction return finale »).
export function allowed(policy: Policy, actor: Actor): boolean {
  switch (policy) {
    case "STAFF_WRITE":
      return actor.user?.role === "admin" || actor.user?.role === "superviseur";
    case "OPEN_UNTIL_KIOSK":
      return true;
  }
}
