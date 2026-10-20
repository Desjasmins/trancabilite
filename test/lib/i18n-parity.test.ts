import { describe, it, expect } from "vitest";
import { I } from "@/lib/i18n";

/** Chemins de toutes les feuilles (`a.b.c`) d'un dictionnaire. */
const leaves = (o: object, pre = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? leaves(v, `${pre}${k}.`) : [`${pre}${k}`],
  );

describe("i18n — parité fr / en", () => {
  it("Quand on compare les deux dictionnaires, alors ils ont exactement les mêmes clés", () => {
    expect(leaves(I.en).sort()).toEqual(leaves(I.fr).sort());
  });
  it("Quand on lit les textes du compteur de reprises (#22), alors ils existent dans les deux langues", () => {
    expect([I.fr.reworkCount, I.en.reworkCount]).toEqual(["{n} reprise(s)", "{n} rework(s)"]);
    expect([I.fr.repReworks, I.en.repReworks]).toEqual(["Reprises", "Reworks"]);
    expect([I.fr.visual, I.en.visual]).toEqual(["Contrôle visuel", "Visual inspection"]);
  });
});
