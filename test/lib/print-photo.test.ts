// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { printSlip } from "@/lib/print";
import { I } from "@/lib/i18n";
import type { UnitDTO } from "@/lib/types";

afterEach(() => vi.unstubAllGlobals());

describe("printSlip — Étant donné une unité avec photo de défaut (#23, B5)", () => {
  it("Quand on imprime le bon de livraison, alors aucune image ni mention de photo", () => {
    let html = "";
    vi.stubGlobal("open", vi.fn(() => ({ document: { write: (h: string) => { html = h; }, close: vi.fn() } })));
    const unit: UnitDTO = {
      id: "U1", serie: "001", projet: "P", reference: "R", po: "", dessin: "", sub: "S", batchId: "B", livraison: "LIV-1",
      dateCreation: "2026-10-20T00:00:00.000Z", etiquette: { par: null, date: null, imprimee: true },
      montage: { par: "Max", date: null, ecran: null },
      test: { par: "Ana", date: null, ecran: null, diel: "accept", pol: "accept", eff: "accept", visual: "refus", eventId: "E1", hasPhoto: true },
      verification: { par: "Léo", date: null, ecran: null }, nc: "", reprise: null,
      currentOperationKey: null, blocked: false, version: 3,
    };
    expect(printSlip("LIV-1", [unit], [], I.fr, "fr")).toEqual({ ok: true });
    expect(html).toContain("001");
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/units\/|nc-photos|E1|token=/);
  });
});
