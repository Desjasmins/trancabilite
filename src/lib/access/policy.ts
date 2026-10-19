import type { Role } from "@/lib/auth";
import type { AccessError } from "./errors";

/**
 * Contrôle d'accès des Server Actions (#3, #4) — partie pure, sans I/O.
 * L'acteur porte les deux identités : le compte connecté et l'écran d'atelier (TDD §11, B2).
 */
export interface ActorUser {
  id: string;
  name: string;
  email: string;
  /** Rôle hors {admin, superviseur, client} → null : aucun droit. */
  role: Role | null;
}

/** Écran d'atelier appairé et non révoqué. */
export interface ActorKiosk {
  id: string;
  label: string;
}

export interface Actor {
  user: ActorUser | null;
  kiosk: ActorKiosk | null;
  /** Un cookie d'écran désigne un Kiosk révoqué (un cookie inconnu compte comme absent). */
  kioskRevoked: boolean;
}

/**
 * OPEN_UNTIL_KIOSK : TEMPORAIRE. Les actions d'atelier restent ouvertes tant que l'écran
 * n'est pas exigé (#5). Seule exception dès le #4 : un écran révoqué est refusé, sauf staff
 * connecté (NB-a, décision de Gedeon).
 */
export type Policy = "ADMIN_WRITE" | "STAFF_WRITE" | "OPEN_UNTIL_KIOSK";

const isStaff = (actor: Actor) => actor.user?.role === "admin" || actor.user?.role === "superviseur";

// Pas de `default` : ajouter une politique sans la traiter ici est une erreur de type
// (« la fonction n'a pas d'instruction return finale »).
export function allowed(policy: Policy, actor: Actor): boolean {
  switch (policy) {
    case "ADMIN_WRITE":
      return actor.user?.role === "admin";
    case "STAFF_WRITE":
      return isStaff(actor);
    case "OPEN_UNTIL_KIOSK":
      return !actor.kioskRevoked || isStaff(actor);
  }
}

/** Code renvoyé quand `allowed` refuse. */
export function refusal(policy: Policy, actor: Actor): AccessError {
  if (policy === "OPEN_UNTIL_KIOSK" && actor.kioskRevoked) return "KIOSK_REVOKED";
  return actor.user ? "FORBIDDEN" : "AUTH_REQUIRED";
}
