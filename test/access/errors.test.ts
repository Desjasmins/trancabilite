import { describe, it, expect } from "vitest";
import { errorMessage } from "@/lib/access/errors";
import { I } from "@/lib/i18n";

describe("errorMessage — Étant donné le code renvoyé par une Server Action", () => {
  it.each(["fr", "en"] as const)("Quand le code est AUTH_REQUIRED ou FORBIDDEN (%s), alors le texte traduit", (lang) => {
    const t = I[lang];
    expect(errorMessage("AUTH_REQUIRED", t)).toBe(t.errors.AUTH_REQUIRED);
    expect(errorMessage("FORBIDDEN", t)).toBe(t.errors.FORBIDDEN);
  });
  it("Quand le code est GENERIC ou absent, alors le repli traduit, jamais « Erreur »", () => {
    expect(errorMessage("GENERIC", I.en)).toBe(I.en.errors.generic);
    expect(errorMessage(undefined, I.fr)).toBe(I.fr.errors.generic);
    expect(errorMessage("", I.fr)).toBe(I.fr.errors.generic);
  });
  it("Quand c'est un message métier (hors codes, D4), alors il passe tel quel", () => {
    expect(errorMessage("Unité introuvable", I.fr)).toBe("Unité introuvable");
  });
  it("Quand on lit les deux langues, alors les quatre clés existent et ne disent pas « Erreur »", () => {
    for (const t of [I.fr, I.en]) {
      for (const k of ["AUTH_REQUIRED", "FORBIDDEN", "generic", "network"] as const) {
        expect(t.errors[k]).toBeTruthy();
        expect(t.errors[k]).not.toMatch(/^Erreur|^Error/);
      }
    }
  });
});

describe("i18n — Étant donné les clés ajoutées par #3", () => {
  it("Quand on lit fr et en, alors chaque texte de l'encart « base non connectée » existe dans les deux", () => {
    for (const k of ["dbTitle", "dbLead", "dbStepEnvA", "dbStepEnvB", "dbStepPush", "dbStepSeed", "dbServerLog"] as const) {
      expect(I.fr[k]).toBeTruthy();
      expect(I.en[k]).toBeTruthy();
      expect(I.en[k]).not.toBe(I.fr[k]);
    }
  });
});
