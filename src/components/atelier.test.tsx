// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions", () => ({
  createBatchAction: vi.fn(async () => ({ ok: true })),
  markPrintedAction: vi.fn(async () => ({ ok: false, error: "GENERIC" })),
  confirmMontageAction: vi.fn(), confirmMontageBulkAction: vi.fn(), retestUnitAction: vi.fn(),
  confirmTestAction: vi.fn(), confirmVerifAction: vi.fn(), packUnitAction: vi.fn(),
  createDeliveryAction: vi.fn(), closeDeliveryAction: vi.fn(),
}));
vi.mock("@/lib/print", () => ({ printLabels: vi.fn(async () => ({ ok: true, message: "envoyé" })), printSlip: vi.fn() }));
vi.mock("@/lib/usb", () => ({ connectUSB: vi.fn(), isUsbConnected: () => false }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./app-context", () => ({ useApp: vi.fn() }));

import { toast } from "sonner";
import { markPrintedAction, confirmTestAction } from "@/app/actions";
import { useApp } from "./app-context";
import { Atelier } from "./atelier";
import { LangProvider } from "./lang-provider";
import { defaultTemplate } from "@/lib/label";
import { I } from "@/lib/i18n";

afterEach(cleanup);

describe("Atelier, poste Étiquettes — Étant donné un lot créé puis imprimé (revue #3, R4)", () => {
  it("Quand le marquage « imprimée » échoue, alors un toast traduit au lieu d'un échec silencieux", async () => {
    const run = vi.fn(async () => ({ ok: true, createdIds: ["U1"], units: [] }));
    vi.mocked(useApp).mockReturnValue({
      units: [], batches: [], deliveries: [], operations: [], routes: [],
      settings: { sub: "", proj: "P", ops: ["Ana"] }, template: defaultTemplate(),
      ui: { station: "etiquettes", op: { etiquettes: "Ana" }, lastCreated: [], client: false },
      setUi: vi.fn(), run, t: I.fr, lang: "fr", pending: false, user: null,
    } as unknown as ReturnType<typeof useApp>);
    render(<LangProvider><Atelier /></LangProvider>);
    expect(screen.getByPlaceholderText(I.fr.startSerialAuto)).toBeTruthy();
    fireEvent.click(screen.getByText(I.fr.create));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(I.fr.errors.generic));
    expect(markPrintedAction).toHaveBeenCalledWith({ unitIds: ["U1"] });
  });
});

// #21 : essai visuel au poste Test, badge « Reprise » au Montage.
function unitAt(key: string, over: Record<string, unknown> = {}) {
  return {
    id: "U1", serie: "007", projet: "P", reference: "R", po: "", dessin: "", sub: "", batchId: "B", livraison: "",
    dateCreation: "2026-10-20T00:00:00.000Z", etiquette: { par: null, date: null, imprimee: true },
    montage: { par: "Max", date: null, ecran: null },
    test: { par: null, date: null, ecran: null, diel: null, pol: null, eff: null, visual: null },
    verification: { par: null, date: null, ecran: null },
    nc: "", reprise: null, reprises: 0, currentOperationKey: key, blocked: false, version: 1, ...over,
  };
}
function mount(station: string, units: unknown[], ui: Record<string, unknown> = {}) {
  const run = vi.fn(async () => ({ ok: true }));
  vi.mocked(useApp).mockReturnValue({
    units, batches: [], deliveries: [], operations: [], routes: [],
    settings: { sub: "", proj: "P", ops: ["Ana"] }, template: defaultTemplate(),
    ui: { station, op: { [station]: "Ana" }, lastCreated: [], client: false, scanUnit: null,
      pendingTest: { diel: null, pol: null, eff: null, visual: null }, verifArm: false, ...ui },
    setUi: vi.fn(), run, t: I.fr, lang: "fr", pending: false, user: null,
  } as unknown as ReturnType<typeof useApp>);
  render(<LangProvider><Atelier /></LangProvider>);
  return run;
}
const all = (visual: string, elec = "accept") => ({ diel: "accept", pol: elec, eff: "accept", visual });

describe("Atelier, poste Test — Étant donné l'essai visuel (#21)", () => {
  afterEach(() => vi.clearAllMocks());

  it("Quand une unité est ouverte, alors la ligne Contrôle visuel suit les essais PAN 003", () => {
    mount("test", [unitAt("test")], { scanUnit: "U1" });
    expect(screen.getByText(I.fr.visual)).toBeTruthy();
    expect(screen.getByText(I.fr.visualHint)).toBeTruthy();
    expect(screen.getAllByText(I.fr.accept)).toHaveLength(4);
  });

  it("Quand le visuel n'est pas encore choisi, alors rien n'est envoyé", () => {
    const run = mount("test", [unitAt("test")], { scanUnit: "U1", pendingTest: all(null as never) });
    fireEvent.click(screen.getByText(I.fr.confirmTest));
    expect(run).not.toHaveBeenCalled();
  });

  it("Quand le visuel est refusé sans motif, alors un toast demande le motif et rien n'est envoyé", () => {
    const run = mount("test", [unitAt("test")], { scanUnit: "U1", pendingTest: all("refus") });
    fireEvent.click(screen.getByText(I.fr.confirmTest));
    expect(toast.error).toHaveBeenCalledWith(I.fr.ncRequired);
    expect(run).not.toHaveBeenCalled();
    expect(confirmTestAction).not.toHaveBeenCalled();
  });

  it("Quand le visuel est refusé avec motif, alors l'essai part avec visual et le toast de renvoi au Montage", async () => {
    const run = mount("test", [unitAt("test")], { scanUnit: "U1", pendingTest: all("refus") });
    fireEvent.change(screen.getByPlaceholderText(I.fr.ncNote), { target: { value: "rayure" } });
    fireEvent.click(screen.getByText(I.fr.confirmTest));
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(confirmTestAction).toHaveBeenCalledWith({ unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "accept", visual: "refus", nc: "rayure" });
    expect(run.mock.calls[0]).toEqual([undefined, I.fr.toastVisualRework, true]);
  });

  it("Quand le serveur refuse l'essai, alors la carte reste ouverte avec ses résultats", async () => {
    const run = mount("test", [unitAt("test")], { scanUnit: "U1", pendingTest: all("accept") });
    run.mockResolvedValueOnce({ ok: false } as never);
    fireEvent.click(screen.getByText(I.fr.confirmTest));
    await waitFor(() => expect(run).toHaveBeenCalled());
    const setUi = vi.mocked(useApp).mock.results[0].value.setUi as ReturnType<typeof vi.fn>;
    expect(setUi).not.toHaveBeenCalled();
  });

  it("Quand seul un essai électrique est refusé, alors le toast de blocage", async () => {
    const run = mount("test", [unitAt("test")], { scanUnit: "U1", pendingTest: all("accept", "refus") });
    fireEvent.change(screen.getByPlaceholderText(I.fr.ncNote), { target: { value: "inversée" } });
    fireEvent.click(screen.getByText(I.fr.confirmTest));
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(run.mock.calls[0]).toEqual([undefined, I.fr.toastReject, true]);
  });

  it("Quand tout est accepté, alors le toast d'essais enregistrés, sans motif", async () => {
    const run = mount("test", [unitAt("test")], { scanUnit: "U1", pendingTest: all("accept") });
    fireEvent.click(screen.getByText(I.fr.confirmTest));
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(vi.mocked(confirmTestAction).mock.calls[0][0]).toMatchObject({ visual: "accept", nc: "" });
    expect(run.mock.calls[0]).toEqual([undefined, I.fr.toastTest, false]);
  });
});

describe("Atelier, poste Test — Étant donné une unité choisie (#21)", () => {
  afterEach(() => vi.clearAllMocks());
  const empty = { diel: null, pol: null, eff: null, visual: null };
  const setUiOf = () => vi.mocked(useApp).mock.results[0].value.setUi as ReturnType<typeof vi.fn>;
  it("Quand elle est scannée, alors les résultats repartent vides, visuel compris", () => {
    mount("test", [unitAt("test")]);
    fireEvent.keyDown(screen.getByPlaceholderText(I.fr.scanField), { key: "Enter", target: { value: "007" } });
    expect(setUiOf()).toHaveBeenCalledWith({ scanUnit: "U1", pendingTest: empty, verifArm: false });
  });
  it("Quand elle est touchée dans la file, alors les résultats repartent vides, visuel compris", () => {
    mount("test", [unitAt("test")]);
    fireEvent.click(screen.getByText("S.N. 007"));
    expect(setUiOf()).toHaveBeenCalledWith({ scanUnit: "U1", pendingTest: empty, verifArm: false });
  });
});

describe("Atelier, poste Montage — Étant donné une unité renvoyée par le contrôle visuel (#21)", () => {
  afterEach(() => vi.clearAllMocks());
  const back = unitAt("montage", { reprise: { note: "rayure", at: "2026-10-20T10:00:00.001Z" } });

  it("Quand elle attend au Montage, alors sa carte porte le badge Reprise et le motif", () => {
    mount("montage", [back, unitAt("montage", { id: "U2", serie: "008" })]);
    expect(screen.getAllByText(I.fr.reworkBadge)).toHaveLength(1);
    expect(screen.getByText("rayure")).toBeTruthy();
  });

  it("Quand elle est ouverte au Montage, alors l'encart dit qu'elle a été renvoyée par le contrôle visuel, avec le motif", () => {
    mount("montage", [back], { scanUnit: "U1" });
    expect(screen.getByText(`${I.fr.reworkFromVisual} — rayure`)).toBeTruthy();
  });

  it("Quand la reprise n'a pas de motif, alors l'encart sans tiret", () => {
    mount("montage", [unitAt("montage", { reprise: { note: "", at: "x" } })], { scanUnit: "U1" });
    expect(screen.getByText(I.fr.reworkFromVisual)).toBeTruthy();
  });
});

describe("i18n — Étant donné les textes du contrôle visuel (#21)", () => {
  it("Quand on compare fr et en, alors chaque clé a sa traduction non vide, et les textes suivent l'inventaire", () => {
    const keys = ["visual", "visualHint", "ncRequired", "toastVisualRework", "reworkBadge", "reworkFromVisual"] as const;
    for (const k of keys) { expect(I.fr[k]).toBeTruthy(); expect(I.en[k]).toBeTruthy(); }
    expect(I.en.toastVisualRework).toBe("Visual inspection failed: unit sent back to Assembly");
    expect(I.fr.toastVisualRework).toBe("Refus visuel : unité renvoyée au Montage");
  });
  it("Quand on liste les clés, alors fr et en ont exactement les mêmes (parité)", () => {
    const flat = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]);
    expect(flat(I.en).sort()).toEqual(flat(I.fr).sort());
  });
});
