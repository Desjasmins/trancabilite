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
  /** Session d'un compte banni (#5) : `user` reste null, aucun droit, mais ce n'est pas l'acteur nul. */
  banned: boolean;
  kiosk: ActorKiosk | null;
  /** Un cookie d'écran désigne un Kiosk révoqué (un cookie inconnu compte comme absent). */
  kioskRevoked: boolean;
}

/**
 * FLOOR_WRITE : écran appairé, ou admin/superviseur. READ : écran appairé, ou compte de rôle
 * connu (admin, superviseur, client). Écran révoqué : refusé, sauf staff connecté (NB-a).
 * Le compte n'élargit ni ne restreint l'écran (NB-b).
 */
export type Policy = "ADMIN_WRITE" | "STAFF_WRITE" | "FLOOR_WRITE" | "READ";

const isStaff = (actor: Actor) => actor.user?.role === "admin" || actor.user?.role === "superviseur";

/** Ni session (même bannie) ni cookie d'écran : le seul cas que le drapeau éteint assouplit (TDD §12 B7). */
const isNull = (actor: Actor) => !actor.user && !actor.banned && !actor.kiosk && !actor.kioskRevoked;

/** Garde de l'atelier : écran, ou exception propre à la politique, ou acteur nul drapeau éteint. */
function floor(actor: Actor, enforceFloor: boolean, accountOk: boolean): boolean {
  if (actor.kioskRevoked) return isStaff(actor);
  return actor.kiosk !== null || accountOk || (!enforceFloor && isNull(actor));
}

// Pas de `default` : ajouter une politique sans la traiter ici est une erreur de type
// (« la fonction n'a pas d'instruction return finale »).
/** `enforceFloor` : drapeau serveur (#5) ; omis → garde active (défaut fermé). */
export function allowed(policy: Policy, actor: Actor, enforceFloor = true): boolean {
  switch (policy) {
    case "ADMIN_WRITE":
      return actor.user?.role === "admin";
    case "STAFF_WRITE":
      return isStaff(actor);
    case "FLOOR_WRITE":
      return floor(actor, enforceFloor, isStaff(actor));
    case "READ":
      return floor(actor, enforceFloor, actor.user?.role != null);
  }
}

/** Code renvoyé quand `allowed` refuse. Un banni a une session : FORBIDDEN. */
export function refusal(policy: Policy, actor: Actor): AccessError {
  if ((policy === "FLOOR_WRITE" || policy === "READ") && actor.kioskRevoked) return "KIOSK_REVOKED";
  return actor.user || actor.banned ? "FORBIDDEN" : "AUTH_REQUIRED";
}
