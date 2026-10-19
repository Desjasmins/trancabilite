import { describe, it, expect } from "vitest";
import { projectSnapshot } from "@/lib/access/project";
import { defaultTemplate } from "@/lib/label";
import type { LabelTemplate } from "@/lib/types";
import { PROFILES, PROFILE_NAMES } from "./profiles";

const template = { ...defaultTemplate(), presetId: "gabarit-maison" } as LabelTemplate;
const snapshot = {
  units: [{ id: "U1" }],
  settings: { sub: "S", proj: "P", ops: ["Ana", "Léo"] },
  template,
};

describe("projectSnapshot — Étant donné un instantané complet", () => {
  it("Quand l'acteur est un client, alors ni la liste des opérateurs ni le gabarit enregistré", () => {
    const out = projectSnapshot(snapshot, PROFILES.client.actor);
    expect(out.settings.ops).toEqual([]);
    expect(out.settings.sub).toBe("S");
    expect(out.template).toEqual(defaultTemplate());
    expect(out.template.presetId).not.toBe("gabarit-maison");
    expect(out.units).toBe(snapshot.units);
    expect(snapshot.settings.ops).toEqual(["Ana", "Léo"]); // pas de mutation
  });

  it.each(PROFILE_NAMES.filter((n) => n !== "client"))(
    "Quand l'acteur est %s, alors l'instantané passe tel quel (l'anonyme reste « kiosque » jusqu'au #4)",
    (name) => {
      expect(projectSnapshot(snapshot, PROFILES[name].actor)).toBe(snapshot);
    },
  );

  it("Quand un client reçoit un résultat sans réglages ni gabarit, alors rien n'est ajouté", () => {
    const live = { ok: true, units: [] };
    expect(projectSnapshot(live, PROFILES.client.actor)).toEqual({ ok: true, units: [] });
  });

  it("Quand un client est connecté sur un écran appairé, alors projection complète : c'est l'écran qui est autorisé (NB-b, #4)", () => {
    const actor = { ...PROFILES.client.actor, kiosk: { id: "k1", label: "Établi 2" } };
    expect(projectSnapshot(snapshot, actor)).toBe(snapshot);
  });

  it("Quand un client est sur un écran révoqué, alors projection client", () => {
    const actor = { ...PROFILES.client.actor, kioskRevoked: true };
    expect(projectSnapshot(snapshot, actor).settings.ops).toEqual([]);
  });
});
