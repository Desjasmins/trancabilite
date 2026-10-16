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
