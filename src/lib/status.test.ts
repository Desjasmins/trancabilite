import { describe, it, expect } from "vitest";
import { statut, nextSerial } from "./status";
import type { UnitDTO } from "./types";

function unite(p: Partial<UnitDTO>): UnitDTO {
  return {
    id: "U", serie: "001", projet: "P1", reference: "R1", po: "", dessin: "", sub: "",
    batchId: "B", livraison: "", dateCreation: "2026-01-01T00:00:00.000Z",
    currentOperationKey: "montage", blocked: false, ...p,
  } as UnitDTO;
}

describe("statut — Étant donné une unité et son cache d'état", () => {
  it("Quand l'unité est bloquée, alors son statut est « rejet », même en cours", () => {
    expect(statut(unite({ blocked: true, currentOperationKey: "test" }))).toBe("rejet");
    expect(statut(unite({ blocked: true, currentOperationKey: null, livraison: "LIV-2026-001" }))).toBe("rejet");
  });
  it("Quand la gamme est terminée et l'unité livrée, alors « livre »", () => {
    expect(statut(unite({ currentOperationKey: null, livraison: "LIV-2026-001" }))).toBe("livre");
  });
  it("Quand la gamme est terminée sans livraison, alors « pret »", () => {
    expect(statut(unite({ currentOperationKey: null, livraison: "" }))).toBe("pret");
  });
  it("Quand l'unité est en cours, alors son statut est l'opération courante", () => {
    expect(statut(unite({ currentOperationKey: "test" }))).toBe("test");
  });
});

describe("nextSerial — Étant donné des unités existantes", () => {
  it("Quand aucune unité n'existe pour le couple, alors la série commence à 1", () => {
    expect(nextSerial([], "P1", "R1")).toBe(1);
  });
  it("Quand des séries existent, alors on prend le maximum + 1 (pas le nombre d'unités)", () => {
    const u = [unite({ serie: "003" }), unite({ serie: "007" }), unite({ serie: "005" })];
    expect(nextSerial(u, "P1", "R1")).toBe(8);
  });
  it("Quand d'autres projets ou références existent, alors ils sont ignorés", () => {
    const u = [unite({ serie: "002" }), unite({ serie: "050", reference: "R2" }), unite({ serie: "090", projet: "P2" })];
    expect(nextSerial(u, "P1", "R1")).toBe(3);
  });
  it("Quand un départ est fourni au-dessus des séries, alors la série commence au départ", () => {
    expect(nextSerial([], "P1", "R1", "100")).toBe(100);
    expect(nextSerial([unite({ serie: "004" })], "P1", "R1", 10)).toBe(10);
  });
  it("Quand le départ est sous le maximum existant, alors maximum + 1", () => {
    expect(nextSerial([unite({ serie: "020" })], "P1", "R1", 5)).toBe(21);
  });
  it("Quand une série n'est pas numérique, alors elle est ignorée", () => {
    expect(nextSerial([unite({ serie: "abc" }), unite({ serie: "002" })], "P1", "R1")).toBe(3);
  });
});
