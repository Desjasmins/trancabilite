import { describe, it, expect } from "vitest";
import { COMMON_TESTS, PAN003_TESTS, testsFor } from "./tests";

describe("testsFor — Étant donné les essais d'un type et l'essai commun (#21)", () => {
  it("Quand on prend les essais PAN 003, alors l'ordre est PAN 003 puis Visuel", () => {
    expect(testsFor()).toEqual(["diel", "pol", "eff", "visual"]);
    expect(testsFor(PAN003_TESTS)).toEqual([...PAN003_TESTS, ...COMMON_TESTS]);
  });
  it("Quand le type n'a aucun essai électrique, alors seul le Visuel reste", () => {
    expect(testsFor([])).toEqual(["visual"]);
  });
});
