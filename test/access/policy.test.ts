import { describe, it, expect } from "vitest";
import { allowed, type Policy } from "@/lib/access/policy";
import { PROFILES, PROFILE_NAMES, type ProfileName } from "./profiles";

// Matrice écrite à la main : c'est le contrat, pas un recalcul de l'implémentation.
const EXPECTED: Record<Policy, Record<ProfileName, boolean>> = {
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

  it("Quand le rôle est inconnu (null), alors STAFF_WRITE est refusé même avec un nom et un id", () => {
    expect(allowed("STAFF_WRITE", { user: { id: "x", name: "x", email: "x", role: null } })).toBe(false);
  });

  it.each(["Admin", "admin  ", "ADMIN", "Superviseur"])(
    "Quand le rôle vaut « %s » (casse ou espaces), alors STAFF_WRITE est refusé (mutation M4 du QA)",
    (role) => {
      expect(allowed("STAFF_WRITE", { user: { id: "x", name: "x", email: "x", role: role as never } })).toBe(false);
    },
  );
});
