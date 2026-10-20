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
