import { describe, it, expect } from "vitest";
import { toUnitDTO } from "@/lib/mappers";

const at = (s: string) => new Date(`2026-10-1${s}T00:00:00Z`);
const ev = (operationKey: string, stationId: string | null, day: string, operator = "Ana") =>
  ({ id: `${operationKey}-${day}`, unitId: "U1", operationKey, result: "done", operator, stationId, data: null, note: null, createdAt: at(day) });
const unit = (events: unknown[]) => ({
  id: "U1", serie: "001", projet: "P", reference: "R", po: null, dessin: null, sub: null, batchId: null, deliveryId: null,
  dateCreation: at("0"), etiquettePar: null, etiquetteDate: null, etiquetteImprimee: false, nc: null,
  currentOperationKey: null, blocked: false, version: 1, events,
}) as never;

describe("toUnitDTO — Étant donné l'écran écrit au journal (#4)", () => {
  it("Quand le dernier événement d'une étape porte un écran connu, alors son libellé courant", () => {
    const labels = new Map([["k1", "Établi 2"], ["k2", "Établi 3"]]);
    const dto = toUnitDTO(unit([ev("montage", "k1", "1"), ev("montage", "k2", "2", "Léo"), ev("test", null, "3")]), labels);
    expect(dto.montage).toEqual({ par: "Léo", date: at("2").toISOString(), ecran: "Établi 3" });
    expect(dto.test.ecran).toBeNull();
    expect(dto.verification).toEqual({ par: null, date: null, ecran: null });
  });

  it("Quand l'écran n'existe plus dans la table, alors null (écran non identifié)", () => {
    expect(toUnitDTO(unit([ev("montage", "disparu", "1")]), new Map()).montage.ecran).toBeNull();
  });

  it("Quand on n'a pas de table des écrans, alors tout est null (forme historique)", () => {
    expect(toUnitDTO(unit([ev("montage", "k1", "1")])).montage.ecran).toBeNull();
  });
});

describe("toUnitDTO — Étant donné des événements au même instant (#19)", () => {
  const same = (id: string, result: string, operator: string) =>
    ({ id, unitId: "U1", operationKey: "test", result, operator, stationId: null, data: null, note: null, createdAt: at("1") });
  it("Quand fail et pass ont le même createdAt, alors le dernier selon compareEvents gagne, quel que soit l'ordre d'entrée", () => {
    const a = same("z", "fail", "Ana"), b = same("a", "pass", "Léo");
    expect(toUnitDTO(unit([b, a])).test.par).toBe("Léo");
    expect(toUnitDTO(unit([a, b])).test.par).toBe("Léo");
  });
});

// #21 (B2, B3) : le Test lit le dernier ESSAI réel ; le badge « Reprise » vient du journal.
describe("toUnitDTO — Étant donné un renvoi au Montage par le contrôle visuel (#21)", () => {
  let n = 0;
  const e = (operationKey: string, result: string, ms: number, over: Record<string, unknown> = {}) =>
    ({ id: `e${n++}`, unitId: "U1", operationKey, result, operator: "Ana", stationId: null, data: null, note: null,
      createdAt: new Date(Date.UTC(2026, 9, 20, 10, 0, 0, ms)), ...over });
  const failV = (ms: number, op = "Ana") => e("test", "fail", ms, { operator: op, note: "rayure",
    data: { diel: "accept", pol: "refus", eff: "accept", visual: "refus" } });
  const rework = (ms: number) => e("test", "rework", ms, { operator: "Zoé", note: "rayure", data: { to: "montage", cause: "visual" } });
  const pass = (ms: number) => e("test", "pass", ms, { operator: "Léo", data: { diel: "accept", pol: "accept", eff: "accept", visual: "accept" } });

  it("Quand fail puis rework, alors test.par/diel/visual restent ceux du fail", () => {
    const dto = toUnitDTO(unit([e("montage", "done", 0), failV(10), rework(11)]));
    expect(dto.test).toMatchObject({ par: "Ana", pol: "refus", visual: "refus", date: new Date(Date.UTC(2026, 9, 20, 10, 0, 0, 10)).toISOString() });
  });
  it("Quand fail, rework, montage puis pass, alors ceux du pass", () => {
    const dto = toUnitDTO(unit([e("montage", "done", 0), failV(10), rework(11), e("montage", "done", 20), pass(30)]));
    expect(dto.test).toMatchObject({ par: "Léo", pol: "accept", visual: "accept" });
  });
  it("Quand le montage n'a qu'un événement non done au journal, alors il est ignoré pour montage.par", () => {
    const dto = toUnitDTO(unit([e("montage", "done", 0, { operator: "Max" }), e("montage", "rework", 5, { operator: "X" })]));
    expect(dto.montage.par).toBe("Max");
  });
  it("Quand un ancien essai n'a pas de visuel, alors visual null", () => {
    expect(toUnitDTO(unit([e("test", "pass", 1, { data: { diel: "accept" } })])).test.visual).toBeNull();
  });
  it("Quand l'unité vient d'être renvoyée, alors reprise = { note, at } du rework", () => {
    const dto = toUnitDTO(unit([e("montage", "done", 0), failV(10), rework(11)]));
    expect(dto.reprise).toEqual({ note: "rayure", at: new Date(Date.UTC(2026, 9, 20, 10, 0, 0, 11)).toISOString() });
  });
  it("Quand le Montage est refait après le renvoi, alors reprise null", () => {
    expect(toUnitDTO(unit([e("montage", "done", 0), failV(10), rework(11), e("montage", "done", 20)])).reprise).toBeNull();
  });
  it("Quand aucun renvoi, alors reprise null", () => {
    expect(toUnitDTO(unit([e("montage", "done", 0)])).reprise).toBeNull();
  });
});
