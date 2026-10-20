import { describe, it, expect } from "vitest";
import { I } from "./i18n";

/** Chemins de toutes les clés feuilles (objets imbriqués compris). */
function keys(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("i18n — Étant donné les dictionnaires fr et en", () => {
  it("Quand on compare leurs clés, alors elles sont identiques", () => {
    expect(keys(I.en).sort()).toEqual(keys(I.fr).sort());
  });
  it("Quand on lit une clé, alors aucun texte n'est vide", () => {
    for (const lang of [I.fr, I.en]) {
      for (const path of keys(lang)) {
        const v = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lang);
        if (typeof v === "string") expect(v.trim(), path).not.toBe("");
      }
    }
  });
  it("Quand on lit les alertes « gamme sans poste Test » (#20), alors fr et en existent", () => {
    expect(I.fr.warnNoVisualLot).toBe("Cette gamme n'a pas de poste Test : les unités de ce lot ne passeront pas le contrôle visuel.");
    expect(I.en.warnNoVisualLot).toBe("This route has no Test station: units in this batch will not get the visual inspection.");
    expect(I.fr.warnNoVisualRoute).toBe("Gamme sans poste Test : ses unités ne passeront pas le contrôle visuel.");
    expect(I.en.warnNoVisualRoute).toBe("Route without a Test station: its units will not get the visual inspection.");
  });
});
