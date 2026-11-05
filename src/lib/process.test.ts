import { describe, it, expect } from "vitest";
import { firstOp, nextOp, isLastOp } from "./process";

const gamme = ["montage", "test", "verification"];

describe("nextOp — Étant donné la gamme montage → test → vérification", () => {
  it("Quand l'unité sort du montage, alors l'opération suivante est le test", () => {
    expect(nextOp(gamme, "montage")).toBe("test");
    expect(nextOp(gamme, "test")).toBe("verification");
  });
  it("Quand l'unité sort de la dernière opération, alors il n'y a plus d'opération (null)", () => {
    expect(nextOp(gamme, "verification")).toBeNull();
  });
  it("Quand l'opération courante n'est pas dans la gamme, alors null (pas la première opération)", () => {
    expect(nextOp(gamme, "emballage")).toBeNull();
  });
  it("Quand la gamme est vide, alors null", () => {
    expect(nextOp([], "montage")).toBeNull();
  });
});

describe("firstOp / isLastOp — Étant donné une gamme", () => {
  it("Quand on demande la première opération, alors on obtient la tête de la gamme, ou null si vide", () => {
    expect(firstOp(gamme)).toBe("montage");
    expect(firstOp([])).toBeNull();
  });
  it("Quand on teste la dernière opération, alors seule la vérification l'est", () => {
    expect(isLastOp(gamme, "verification")).toBe(true);
    expect(isLastOp(gamme, "montage")).toBe(false);
  });
});

// ── #19 (T1) : ordre total du journal et étape courante dérivée ──────────────
import { compareEvents, deriveCurrentStep, type JournalEvent } from "./process";

const T0 = new Date("2026-10-20T10:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const e = (id: string, operationKey: string, result: string, ms: number, data: unknown = null): JournalEvent =>
  ({ id, operationKey, result, createdAt: at(ms), data }) as JournalEvent;

describe("compareEvents — Étant donné des événements écrits dans une même transaction (#19)", () => {
  it("Quand fail et rework ont le même createdAt et sont donnés à l'envers, alors fail puis rework", () => {
    const sorted = [e("a", "test", "rework", 0), e("z", "test", "fail", 0)].sort(compareEvents);
    expect(sorted.map((x) => x.result)).toEqual(["fail", "rework"]);
  });
  it("Quand rework et pass/done ont le même createdAt, alors rework avant pass et done", () => {
    const sorted = [e("a", "t", "pass", 0), e("b", "m", "done", 0), e("c", "t", "rework", 0)].sort(compareEvents);
    expect(sorted.map((x) => x.result)).toEqual(["rework", "pass", "done"]);
  });
  it("Quand le createdAt diffère, alors il prime sur le rang", () => {
    const sorted = [e("a", "t", "fail", 5), e("b", "t", "pass", 0)].sort(compareEvents);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("Quand createdAt et rang sont égaux, alors départage par id", () => {
    expect(compareEvents(e("b", "t", "pass", 0), e("a", "t", "pass", 0))).toBeGreaterThan(0);
    expect(compareEvents(e("a", "t", "pass", 0), e("b", "t", "pass", 0))).toBeLessThan(0);
    expect(compareEvents(e("a", "t", "pass", 0), e("a", "t", "pass", 0))).toBe(0);
  });
  it("Quand le résultat est inconnu, alors il est classé avec pass/done", () => {
    const sorted = [e("a", "t", "autre", 0), e("b", "t", "rework", 0)].sort(compareEvents);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("deriveCurrentStep — Étant donné la gamme montage → test → vérification (#19)", () => {
  const g = ["montage", "test", "verification"];
  it("Quand le journal est vide, alors la première étape", () => {
    expect(deriveCurrentStep(g, [])).toBe("montage");
  });
  it("Quand un retest hérité (rework sans data) suit un refus puis un pass, alors verification", () => {
    const j = [e("1", "montage", "done", 0), e("2", "test", "fail", 1), e("3", "test", "rework", 2), e("4", "test", "pass", 3)];
    expect(deriveCurrentStep(g, j)).toBe("verification");
  });
  it("Quand un rework sans data suit un refus, alors l'unité reste au test", () => {
    const j = [e("1", "montage", "done", 0), e("2", "test", "fail", 1), e("3", "test", "rework", 2)];
    expect(deriveCurrentStep(g, j)).toBe("test");
  });
  it("Quand un renvoi au Montage (rework to=montage) suit un refus, alors montage", () => {
    const j = [e("1", "montage", "done", 0), e("2", "test", "fail", 1), e("3", "test", "rework", 1, { to: "montage" })];
    expect(deriveCurrentStep(g, j)).toBe("montage");
  });
  it("Quand le Montage est refait après le renvoi, alors test", () => {
    const j = [e("1", "montage", "done", 0), e("2", "test", "fail", 1), e("3", "test", "rework", 1, { to: "montage" }), e("4", "montage", "done", 2)];
    expect(deriveCurrentStep(g, j)).toBe("test");
  });
  it("Quand le renvoi vise le test, alors les réussites du test et après sont annulées, pas le montage", () => {
    const j = [e("1", "montage", "done", 0), e("2", "test", "pass", 1), e("3", "verification", "done", 2), e("4", "verification", "rework", 3, { to: "test" })];
    expect(deriveCurrentStep(g, j)).toBe("test");
  });
  it("Quand le renvoi vise une étape absente de la gamme, alors il n'annule rien", () => {
    const j = [e("1", "montage", "done", 0), e("2", "test", "rework", 1, { to: "emballage" })];
    expect(deriveCurrentStep(g, j)).toBe("test");
  });
  it("Quand le journal arrive dans le désordre (fail/rework au même instant), alors même résultat que trié", () => {
    const j = [e("4", "montage", "done", 2), e("3", "test", "rework", 1, { to: "montage" }), e("2", "test", "fail", 1), e("1", "montage", "done", 0)];
    expect(deriveCurrentStep(g, j)).toBe("test");
  });
  it("Quand on passe à une gamme sans Test, alors verification", () => {
    const j = [e("1", "montage", "done", 0), e("2", "test", "fail", 1), e("3", "test", "rework", 2)];
    expect(deriveCurrentStep(["montage", "verification"], j)).toBe("verification");
  });
  it("Quand toutes les étapes sont faites, alors null", () => {
    const j = [e("1", "montage", "done", 0), e("2", "test", "pass", 1), e("3", "verification", "done", 2)];
    expect(deriveCurrentStep(g, j)).toBeNull();
  });
  it("Quand l'entrée est triée, alors le tableau d'origine n'est pas modifié", () => {
    const j = [e("2", "test", "pass", 1), e("1", "montage", "done", 0)];
    deriveCurrentStep(g, j);
    expect(j.map((x) => x.id)).toEqual(["2", "1"]);
  });
});
