import { describe, it, expect } from "vitest";
import { allowed, refusal, type Policy, type Actor } from "@/lib/access/policy";
import { PROFILES, PROFILE_NAMES, type ProfileName } from "./profiles";

// Matrice écrite à la main : c'est le contrat, pas un recalcul de l'implémentation.
const EXPECTED: Record<Policy, Record<ProfileName, boolean>> = {
  ADMIN_WRITE: { anonyme: false, inconnu: false, banni: false, client: false, superviseur: false, admin: true },
  STAFF_WRITE: { anonyme: false, inconnu: false, banni: false, client: false, superviseur: true, admin: true },
  // Temporaire : les actions d'atelier restent ouvertes jusqu'au modèle Kiosk (#4).
  OPEN_UNTIL_KIOSK: { anonyme: true, inconnu: true, banni: true, client: true, superviseur: true, admin: true },
};

describe("allowed — Étant donné la matrice rôles × politiques", () => {
  for (const policy of Object.keys(EXPECTED) as Policy[]) {
    it.each(PROFILE_NAMES)(`Quand %s demande ${policy}, alors la réponse suit la matrice`, (name) => {
      expect(allowed(policy, PROFILES[name].actor)).toBe(EXPECTED[policy][name]);
    });
  }

  it("Quand le rôle est inconnu (null), alors ADMIN_WRITE est refusé", () => {
    expect(allowed("ADMIN_WRITE", { user: { id: "x", name: "x", email: "x", role: null }, kiosk: null, kioskRevoked: false })).toBe(false);
  });

  it("Quand le rôle est inconnu (null), alors STAFF_WRITE est refusé même avec un nom et un id", () => {
    expect(allowed("STAFF_WRITE", { user: { id: "x", name: "x", email: "x", role: null }, kiosk: null, kioskRevoked: false })).toBe(false);
  });

  it.each(["Admin", "admin  ", "ADMIN", "Superviseur"])(
    "Quand le rôle vaut « %s » (casse ou espaces), alors STAFF_WRITE est refusé (mutation M4 du QA)",
    (role) => {
      expect(allowed("STAFF_WRITE", { user: { id: "x", name: "x", email: "x", role: role as never }, kiosk: null, kioskRevoked: false })).toBe(false);
    },
  );
});

// #4 : la matrice × écran (sans écran / écran valide / écran révoqué), écrite à la main.
const VALID = { kiosk: { id: "k1", label: "Établi 2" }, kioskRevoked: false };
const REVOKED = { kiosk: null, kioskRevoked: true };
const withScreen = (name: ProfileName, screen: typeof VALID | typeof REVOKED): Actor =>
  ({ ...PROFILES[name].actor, ...screen });

const FLOOR_VALID: Record<ProfileName, boolean> = { anonyme: true, inconnu: true, banni: true, client: true, superviseur: true, admin: true };
// Écran révoqué : bloqué dès le #4 sur l'atelier, sauf staff connecté (NB-a, décision de Gedeon).
const FLOOR_REVOKED: Record<ProfileName, boolean> = { anonyme: false, inconnu: false, banni: false, client: false, superviseur: true, admin: true };

describe("allowed — Étant donné un écran d'atelier (#4)", () => {
  it.each(PROFILE_NAMES)("Quand %s est sur un écran valide, alors OPEN_UNTIL_KIOSK passe", (name) => {
    expect(allowed("OPEN_UNTIL_KIOSK", withScreen(name, VALID))).toBe(FLOOR_VALID[name]);
  });
  it.each(PROFILE_NAMES)("Quand %s est sur un écran révoqué, alors OPEN_UNTIL_KIOSK suit la matrice", (name) => {
    expect(allowed("OPEN_UNTIL_KIOSK", withScreen(name, REVOKED))).toBe(FLOOR_REVOKED[name]);
  });
  for (const policy of ["ADMIN_WRITE", "STAFF_WRITE"] as const) {
    it.each(PROFILE_NAMES)(`Quand %s est sur un écran (valide ou révoqué), alors ${policy} ne change pas : l'écran n'élargit rien`, (name) => {
      expect(allowed(policy, withScreen(name, VALID))).toBe(EXPECTED[policy][name]);
      expect(allowed(policy, withScreen(name, REVOKED))).toBe(EXPECTED[policy][name]);
    });
  }
});

describe("refusal — Étant donné un refus", () => {
  it("Quand un écran révoqué est refusé sur l'atelier, alors KIOSK_REVOKED", () => {
    expect(refusal("OPEN_UNTIL_KIOSK", withScreen("anonyme", REVOKED))).toBe("KIOSK_REVOKED");
    expect(refusal("OPEN_UNTIL_KIOSK", withScreen("client", REVOKED))).toBe("KIOSK_REVOKED");
  });
  it("Quand un écran révoqué est refusé sur une action du Bureau, alors le code habituel (session)", () => {
    expect(refusal("STAFF_WRITE", withScreen("anonyme", REVOKED))).toBe("AUTH_REQUIRED");
    expect(refusal("ADMIN_WRITE", withScreen("client", REVOKED))).toBe("FORBIDDEN");
  });
  it("Quand aucun écran, alors AUTH_REQUIRED sans session, FORBIDDEN avec", () => {
    expect(refusal("ADMIN_WRITE", PROFILES.anonyme.actor)).toBe("AUTH_REQUIRED");
    expect(refusal("ADMIN_WRITE", PROFILES.superviseur.actor)).toBe("FORBIDDEN");
  });
});
