// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { printSlip } from "./print";
import { I } from "./i18n";
import type { UnitDTO, TestResult } from "./types";

const unit = (over: Partial<UnitDTO> & { visual?: TestResult } = {}): UnitDTO => {
  const { visual = "accept", ...rest } = over;
  return {
    id: "U1", serie: "001", projet: "P", reference: "PAN-1", po: "PO1", dessin: "", sub: "Sous", batchId: "B1",
    livraison: "L1", dateCreation: "2026-10-20T10:00:00.000Z",
    etiquette: { par: null, date: null, imprimee: true },
    montage: { par: "Ana", date: null, ecran: null },
    test: { par: "Léo", date: null, ecran: null, diel: "accept", pol: "accept", eff: "accept", visual },
    verification: { par: "Zoé", date: null, ecran: null },
    nc: "", reprise: null, reprises: 0, currentOperationKey: null, blocked: false, version: 1, ...rest,
  };
};

/** Imprime dans une fenêtre factice (jamais d'impression réelle, GUARDRAILS §12) et renvoie le HTML écrit. */
function render(units: UnitDTO[], lang: "fr" | "en" = "fr") {
  let html = "";
  const w = { document: { write: (s: string) => { html += s; }, close: () => {} } };
  vi.spyOn(window, "open").mockReturnValue(w as unknown as Window);
  const out = printSlip("L1", units, [{ id: "L1", client: "Client", date: "2026-10-20T00:00:00.000Z", closed: true }], I[lang], lang);
  expect(out.ok).toBe(true);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const head = [...doc.querySelectorAll("thead th")].map((th) => th.textContent);
  const rows = [...doc.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim()));
  const cell = (r: number, label: string) => rows[r][head.indexOf(label)];
  return { html, head, rows, cell };
}

afterEach(() => vi.restoreAllMocks());

describe("printSlip — Étant donné le rapport client (#22)", () => {
  it("Quand on l'imprime, alors il a les colonnes Contrôle visuel et Reprises, en fr et en en", () => {
    expect(render([unit()]).head).toEqual(expect.arrayContaining(["Contrôle visuel", "Reprises"]));
    expect(render([unit()], "en").head).toEqual(expect.arrayContaining(["Visual inspection", "Reworks"]));
  });
  it("Quand le visuel est accepté ou refusé, alors A ou R", () => {
    const r = render([unit({ serie: "001" }), unit({ id: "U2", serie: "002", visual: "refus" })]);
    expect(r.cell(0, "Contrôle visuel")).toBe("A");
    expect(r.cell(1, "Contrôle visuel")).toBe("R");
  });
  it("Quand l'essai est antérieur au visuel, alors « — » (tiret long, comme toutes les colonnes d'essai)", () => {
    const r = render([unit({ visual: null, test: { par: null, date: null, ecran: null, diel: null, pol: null, eff: null, visual: null } })]);
    for (const c of ["Contrôle visuel", "Diélectrique", "Polarité", "Effort de raccord"]) expect(r.cell(0, c)).toBe("—");
    expect(r.html).not.toContain("–");
  });
  it("Quand l'unité a été reprise deux fois, alors le client voit 2 ; sinon 0", () => {
    const r = render([unit({ serie: "001", reprises: 2 }), unit({ id: "U2", serie: "002" })]);
    expect(r.cell(0, "Reprises")).toBe("2");
    expect(r.cell(1, "Reprises")).toBe("0");
  });
  it("Quand l'unité porte une photo dans son DTO, alors aucune photo ni data.photo n'apparaît (ISO §8.7)", () => {
    const leaky = { ...unit({ reprises: 1 }), photo: "units/U1/photo.jpg", data: { photo: "units/U1/photo.jpg" } } as UnitDTO;
    const r = render([leaky]);
    expect(r.html).not.toMatch(/<img/i);
    expect(r.html).not.toMatch(/photo/i);
  });
});
