import { describe, it, expect } from "vitest";
import { allowed, refusal, type Policy, type Actor } from "@/lib/access/policy";
import { PROFILES, PROFILE_NAMES, type ProfileName } from "./profiles";

// Matrice écrite à la main : c'est le contrat, pas un recalcul de l'implémentation.
// Sans écran, garde de l'atelier ACTIVE (drapeau posé, #5).
const EXPECTED: Record<Policy, Record<ProfileName, boolean>> = {
  ADMIN_WRITE: { anonyme: false, inconnu: false, banni: false, client: false, superviseur: false, admin: true },
  STAFF_WRITE: { anonyme: false, inconnu: false, banni: false, client: false, superviseur: true, admin: true },
  FLOOR_WRITE: { anonyme: false, inconnu: false, banni: false, client: false, superviseur: true, admin: true },
  READ: { anonyme: false, inconnu: false, banni: false, client: true, superviseur: true, admin: true },
};

describe("allowed — Étant donné la matrice rôles × politiques", () => {
  for (const policy of Object.keys(EXPECTED) as Policy[]) {
    it.each(PROFILE_NAMES)(`Quand %s demande ${policy}, alors la réponse suit la matrice`, (name) => {
      expect(allowed(policy, PROFILES[name].actor, true)).toBe(EXPECTED[policy][name]);
    });
  }

  it("Quand le rôle est inconnu (null), alors ADMIN_WRITE est refusé", () => {
    expect(allowed("ADMIN_WRITE", { user: { id: "x", name: "x", email: "x", role: null }, banned: false, kiosk: null, kioskRevoked: false })).toBe(false);
  });

  it("Quand le rôle est inconnu (null), alors STAFF_WRITE est refusé même avec un nom et un id", () => {
    expect(allowed("STAFF_WRITE", { user: { id: "x", name: "x", email: "x", role: null }, banned: false, kiosk: null, kioskRevoked: false })).toBe(false);
  });

  it.each(["Admin", "admin  ", "ADMIN", "Superviseur"])(
    "Quand le rôle vaut « %s » (casse ou espaces), alors STAFF_WRITE est refusé (mutation M4 du QA)",
    (role) => {
      expect(allowed("STAFF_WRITE", { user: { id: "x", name: "x", email: "x", role: role as never }, banned: false, kiosk: null, kioskRevoked: false })).toBe(false);
    },
  );
});

// #4 : la matrice × écran (sans écran / écran valide / écran révoqué), écrite à la main.
const VALID = { kiosk: { id: "k1", label: "Établi 2" }, kioskRevoked: false };
const REVOKED = { kiosk: null, kioskRevoked: true };
const withScreen = (name: ProfileName, screen: typeof VALID | typeof REVOKED): Actor =>
  ({ ...PROFILES[name].actor, ...screen });

// Écran valide : c'est l'écran qui est autorisé (NB-b), quel que soit le compte, drapeau posé ou non.
const FLOOR_VALID: Record<ProfileName, boolean> = { anonyme: true, inconnu: true, banni: true, client: true, superviseur: true, admin: true };
// Écran révoqué : refusé, sauf staff connecté (NB-a), drapeau posé ou non.
const FLOOR_REVOKED: Record<ProfileName, boolean> = { anonyme: false, inconnu: false, banni: false, client: false, superviseur: true, admin: true };

describe("allowed — Étant donné un écran d'atelier (#4, #5)", () => {
  for (const policy of ["FLOOR_WRITE", "READ"] as const) {
    for (const enforce of [true, false]) {
      it.each(PROFILE_NAMES)(`Quand %s est sur un écran valide, alors ${policy} passe (drapeau ${enforce ? "posé" : "éteint"})`, (name) => {
        expect(allowed(policy, withScreen(name, VALID), enforce)).toBe(FLOOR_VALID[name]);
      });
      it.each(PROFILE_NAMES)(`Quand %s est sur un écran révoqué, alors ${policy} suit la matrice (drapeau ${enforce ? "posé" : "éteint"})`, (name) => {
        expect(allowed(policy, withScreen(name, REVOKED), enforce)).toBe(FLOOR_REVOKED[name]);
      });
    }
  }
  for (const policy of ["ADMIN_WRITE", "STAFF_WRITE"] as const) {
    it.each(PROFILE_NAMES)(`Quand %s est sur un écran (valide ou révoqué), alors ${policy} ne change pas : l'écran n'élargit rien`, (name) => {
      expect(allowed(policy, withScreen(name, VALID), false)).toBe(EXPECTED[policy][name]);
      expect(allowed(policy, withScreen(name, REVOKED), false)).toBe(EXPECTED[policy][name]);
    });
  }
});

// #5, TDD §12 B7 : drapeau éteint, SEUL l'acteur entièrement nul (ni session, ni cookie) passe.
const FLOOR_OFF: Record<ProfileName, boolean> = { anonyme: true, inconnu: false, banni: false, client: false, superviseur: true, admin: true };
const READ_OFF: Record<ProfileName, boolean> = { anonyme: true, inconnu: false, banni: false, client: true, superviseur: true, admin: true };

describe("allowed — Étant donné le drapeau ACCESS_ENFORCE_FLOOR éteint (#5)", () => {
  it.each(PROFILE_NAMES)("Quand %s sans écran demande FLOOR_WRITE, alors seul l'acteur nul est assoupli", (name) => {
    expect(allowed("FLOOR_WRITE", PROFILES[name].actor, false)).toBe(FLOOR_OFF[name]);
  });
  it.each(PROFILE_NAMES)("Quand %s sans écran demande READ, alors seul l'acteur nul est assoupli", (name) => {
    expect(allowed("READ", PROFILES[name].actor, false)).toBe(READ_OFF[name]);
  });
  for (const policy of ["ADMIN_WRITE", "STAFF_WRITE"] as const) {
    it.each(PROFILE_NAMES)(`Quand %s demande ${policy}, alors le drapeau ne change rien`, (name) => {
      expect(allowed(policy, PROFILES[name].actor, false)).toBe(EXPECTED[policy][name]);
    });
  }
  it("Quand le troisième argument est omis, alors la garde est active (défaut fermé)", () => {
    expect(allowed("FLOOR_WRITE", PROFILES.anonyme.actor)).toBe(false);
    expect(allowed("READ", PROFILES.anonyme.actor)).toBe(false);
  });
});

describe("refusal — Étant donné un refus", () => {
  it("Quand un écran révoqué est refusé sur l'atelier ou en lecture, alors KIOSK_REVOKED", () => {
    for (const policy of ["FLOOR_WRITE", "READ"] as const) {
      expect(refusal(policy, withScreen("anonyme", REVOKED))).toBe("KIOSK_REVOKED");
      expect(refusal(policy, withScreen("client", REVOKED))).toBe("KIOSK_REVOKED");
    }
  });
  it("Quand un écran révoqué est refusé sur une action du Bureau, alors le code habituel (session)", () => {
    expect(refusal("STAFF_WRITE", withScreen("anonyme", REVOKED))).toBe("AUTH_REQUIRED");
    expect(refusal("ADMIN_WRITE", withScreen("client", REVOKED))).toBe("FORBIDDEN");
  });
  it("Quand aucun écran, alors AUTH_REQUIRED sans session, FORBIDDEN avec", () => {
    expect(refusal("ADMIN_WRITE", PROFILES.anonyme.actor)).toBe("AUTH_REQUIRED");
    expect(refusal("FLOOR_WRITE", PROFILES.anonyme.actor)).toBe("AUTH_REQUIRED");
    expect(refusal("ADMIN_WRITE", PROFILES.superviseur.actor)).toBe("FORBIDDEN");
    expect(refusal("FLOOR_WRITE", PROFILES.client.actor)).toBe("FORBIDDEN");
  });
  it("Quand la session est bannie, alors FORBIDDEN (pas AUTH_REQUIRED : une session existe, #5)", () => {
    for (const policy of ["ADMIN_WRITE", "STAFF_WRITE", "FLOOR_WRITE", "READ"] as const) {
      expect(refusal(policy, PROFILES.banni.actor)).toBe("FORBIDDEN");
    }
  });
});
