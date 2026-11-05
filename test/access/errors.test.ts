import { describe, it, expect, vi } from "vitest";
import { errorMessage, reportFailure } from "@/lib/access/errors";
import { I } from "@/lib/i18n";

describe("errorMessage — Étant donné le code renvoyé par une Server Action", () => {
  it.each(["fr", "en"] as const)("Quand le code est AUTH_REQUIRED ou FORBIDDEN (%s), alors le texte traduit", (lang) => {
    const t = I[lang];
    expect(errorMessage("AUTH_REQUIRED", t)).toBe(t.errors.AUTH_REQUIRED);
    expect(errorMessage("FORBIDDEN", t)).toBe(t.errors.FORBIDDEN);
  });
  it.each(["fr", "en"] as const)("Quand le code est un code d'écran (#4) (%s), alors le texte traduit", (lang) => {
    const t = I[lang];
    for (const k of ["KIOSK_REVOKED", "KIOSK_NOT_FOUND", "KIOSK_LABEL_TAKEN"] as const) {
      expect(t.errors[k]).toBeTruthy();
      expect(errorMessage(k, t)).toBe(t.errors[k]);
    }
  });
  it.each(["fr", "en"] as const)("Quand le code est SERIAL_TAKEN (#7) (%s), alors le texte traduit qui parle de S.N.", (lang) => {
    const t = I[lang];
    expect(errorMessage("SERIAL_TAKEN", t)).toBe(t.errors.SERIAL_TAKEN);
    expect(t.errors.SERIAL_TAKEN).toContain("S.N.");
    expect(t.errors.SERIAL_TAKEN).not.toMatch(/ [:;?!»]|« /);
  });

  it.each(["fr", "en"] as const)("Quand le code est un refus d'emballage (#8) (%s), alors le texte traduit", (lang) => {
    const t = I[lang];
    for (const k of ["UNIT_ALREADY_PACKED", "UNIT_PACK_CONFLICT"] as const) {
      expect(t.errors[k]).toBeTruthy();
      expect(errorMessage(k, t)).toBe(t.errors[k]);
    }
  });
  it("Quand on lit les textes d'écran en français, alors insécables avant « : », « ? » et dans les guillemets", () => {
    expect(I.fr.stationPairedAs).toBe("Écran enregistré\u00a0:");
    expect(I.fr.stationRevokeConfirm).toBe("Retirer l'accès de «\u00a0{label}\u00a0»\u00a0? L'écran ne pourra plus rien valider.");
    for (const v of [I.fr.errors.KIOSK_LABEL_TAKEN, I.fr.stationPairConfirm]) expect(v).not.toMatch(/ [:;?!»]|« /);
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

describe("reportFailure — Étant donné une action lancée sans l'attendre (markPrinted, revue #3)", () => {
  it("Quand elle réussit, alors aucun message", async () => {
    const notify = vi.fn();
    await reportFailure(Promise.resolve({ ok: true }), I.fr, notify);
    expect(notify).not.toHaveBeenCalled();
  });
  it("Quand elle est refusée, alors le code traduit", async () => {
    const notify = vi.fn();
    await reportFailure(Promise.resolve({ ok: false, error: "GENERIC" }), I.en, notify);
    expect(notify).toHaveBeenCalledWith(I.en.errors.generic);
  });
  it("Quand l'appel échoue (réseau), alors le texte réseau", async () => {
    const notify = vi.fn();
    await reportFailure(Promise.reject(new Error("fetch failed")), I.fr, notify);
    expect(notify).toHaveBeenCalledWith(I.fr.errors.network);
  });
});

// #5 : textes de l'inventaire (UX_COPY_INVENTORY), décision de Gedeon du 2026-10-19.
describe("textes de la garde de l'atelier (#5)", () => {
  it("Quand on lit AUTH_REQUIRED, alors le texte de l'inventaire, en fr et en en", () => {
    expect(I.fr.errors.AUTH_REQUIRED).toBe("Connectez-vous ou utilisez un écran enregistré.");
    expect(I.en.errors.AUTH_REQUIRED).toBe("Sign in or use a registered screen.");
  });
  it("Quand on lit gateSignOut, alors « Se déconnecter » / « Sign out »", () => {
    expect(I.fr.gateSignOut).toBe("Se déconnecter");
    expect(I.en.gateSignOut).toBe("Sign out");
  });
  it("Quand on lit floorGuardOff, alors le texte de l'inventaire, insécable avant « : » en fr", () => {
    expect(I.fr.floorGuardOff).toBe("Garde de l'atelier inactive : l'atelier accepte encore les appels sans écran enregistré.");
    expect(I.en.floorGuardOff).toBe("Shop-floor guard inactive: the shop floor still accepts calls from unregistered screens.");
  });
});

describe("errorMessage — Étant donné les refus du poste Test (#21)", () => {
  it("Quand le serveur rend NC_REQUIRED ou REWORK_TARGET_INVALID, alors le texte traduit fr et en", () => {
    expect(errorMessage("NC_REQUIRED", I.en)).toBe("Reason for failure required");
    expect(errorMessage("REWORK_TARGET_INVALID", I.en)).toBe("Rework step not in the route");
    expect(errorMessage("NC_REQUIRED", I.fr)).toBe("Motif du refus obligatoire");
    expect(errorMessage("REWORK_TARGET_INVALID", I.fr)).toBe("Étape de reprise absente de la gamme");
  });
});
