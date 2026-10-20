// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions", () => ({
  retestUnitOfficeAction: vi.fn(async () => ({ ok: true })),
  saveSettingsAction: vi.fn(), markPrintedAction: vi.fn(), createBatchAction: vi.fn(), updateBatchAction: vi.fn(),
  saveTemplateAction: vi.fn(), getDefectPhotoUrlAction: vi.fn(),
}));
vi.mock("@/lib/print", () => ({ printLabels: vi.fn(), printSlip: vi.fn() }));
vi.mock("@/lib/export", () => ({ exportRegistryXlsx: vi.fn() }));
vi.mock("@/lib/usb", () => ({ connectUSB: vi.fn(), isUsbConnected: () => false }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./app-context", () => ({ useApp: vi.fn() }));
vi.mock("./kiosk-panel", () => ({ KioskList: () => <div>liste-des-ecrans</div> }));

import { retestUnitOfficeAction, markPrintedAction } from "@/app/actions";
import { printLabels } from "@/lib/print";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { getDefectPhotoUrlAction } from "@/app/actions";
import { Bureau } from "./bureau";
import { LangProvider } from "./lang-provider";
import { defaultTemplate } from "@/lib/label";
import { I } from "@/lib/i18n";

afterEach(cleanup);

const blocked = {
  id: "U1", sub: "", projet: "P", reference: "A1", serie: "001", po: "", dessin: "", batchId: "B1",
  livraison: "", dateCreation: "2026-10-16T00:00:00.000Z",
  etiquette: { par: null, date: null, imprimee: false }, montage: { par: "Ana", date: null },
  test: { par: "Léo", date: null, diel: "refus", pol: "accept", eff: "accept" },
  verification: { par: null, date: null }, nc: "court-circuit", currentOperationKey: "test", blocked: true, version: 2,
};

describe("Bureau, fiche d'unité — Étant donné une unité non conforme (#3, Q1)", () => {
  it("Quand on remet en essai, alors l'action du Bureau est appelée sans opérateur (il vient de la session)", async () => {
    const setUi = vi.fn();
    const run = vi.fn(async (p: Promise<unknown>) => p);
    vi.mocked(useApp).mockReturnValue({
      units: [blocked], batches: [], deliveries: [], operations: [], routes: [],
      settings: { sub: "", proj: "", ops: [] }, template: defaultTemplate(),
      ui: { bureauTab: "reg", query: "", filterStatus: "", openId: "U1", client: false },
      setUi, run, t: I.fr, lang: "fr", pending: false, user: null,
    } as unknown as ReturnType<typeof useApp>);

    render(<LangProvider><Bureau /></LangProvider>);
    fireEvent.change(screen.getByPlaceholderText(I.fr.retestNote), { target: { value: "réparé" } });
    fireEvent.click(screen.getByText(I.fr.retestBtn));

    await waitFor(() => expect(setUi).toHaveBeenCalledWith({ openId: null }));
    expect(retestUnitOfficeAction).toHaveBeenCalledWith({ unitId: "U1", note: "réparé" });
    expect(run).toHaveBeenCalledWith(expect.any(Promise), I.fr.toastRetest);
  });

  it("Quand la réimpression réussit mais le marquage « imprimée » échoue, alors un toast traduit (revue #3, R4)", async () => {
    vi.mocked(printLabels).mockResolvedValue({ ok: true, message: "ok" } as never);
    vi.mocked(markPrintedAction).mockResolvedValue({ ok: false, error: "GENERIC" });
    vi.mocked(useApp).mockReturnValue({
      units: [blocked], batches: [], deliveries: [], operations: [], routes: [],
      settings: { sub: "", proj: "", ops: [] }, template: defaultTemplate(),
      ui: { bureauTab: "reg", query: "", filterStatus: "", openId: "U1", client: false },
      setUi: vi.fn(), run: vi.fn(), t: I.fr, lang: "fr", pending: false, user: null,
    } as unknown as ReturnType<typeof useApp>);
    render(<LangProvider><Bureau /></LangProvider>);
    fireEvent.click(screen.getByText(I.fr.reprint));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(I.fr.errors.generic));
    expect(markPrintedAction).toHaveBeenCalledWith({ unitIds: ["U1"] });
  });
});

describe("Bureau, fiche d'unité — Étant donné l'écran écrit au journal (#4)", () => {
  const ctx = (unit: unknown, lang: "fr" | "en" = "fr") => ({
    units: [unit], batches: [], deliveries: [], operations: [], routes: [],
    settings: { sub: "", proj: "", ops: [] }, template: defaultTemplate(),
    ui: { bureauTab: "reg", query: "", filterStatus: "", openId: "U1", client: false },
    setUi: vi.fn(), run: vi.fn(), t: I[lang], lang, pending: false, user: null,
  }) as unknown as ReturnType<typeof useApp>;
  const unit = {
    ...blocked, blocked: false, nc: "",
    montage: { par: "Ana", date: null, ecran: "Établi 2" },
    test: { par: "Léo", date: null, diel: "accept", pol: "accept", eff: "accept", ecran: null },
    verification: { par: null, date: null, ecran: null },
  };

  it("Quand une étape porte un écran, alors son nom ; sans écran, « Écran non identifié » ; étape non faite, rien", () => {
    vi.mocked(useApp).mockReturnValue(ctx(unit));
    render(<LangProvider><Bureau /></LangProvider>);
    expect(screen.getByText("Établi 2")).toBeTruthy();
    expect(screen.getAllByText(I.fr.stationUnknown)).toHaveLength(1);
  });

  it("Quand la langue est l'anglais, alors « Unidentified screen »", () => {
    vi.mocked(useApp).mockReturnValue(ctx(unit, "en"));
    render(<LangProvider><Bureau /></LangProvider>);
    expect(screen.getAllByText("Unidentified screen")).toHaveLength(1);
  });

  it("Quand l'onglet « Écrans d'atelier » est choisi, alors la liste des écrans s'affiche", () => {
    vi.mocked(useApp).mockReturnValue({ ...ctx(unit), ui: { bureauTab: "kiosks" } } as never);
    render(<LangProvider><Bureau /></LangProvider>);
    expect(screen.getByText("liste-des-ecrans")).toBeTruthy();
  });
});

describe("Bureau, fiche d'unité — Étant donné une photo de défaut (#23)", () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
  const unit = (hasPhoto: boolean, eventId: string | null = "E1") => ({
    ...blocked, test: { ...blocked.test, ecran: null, hasPhoto, eventId },
    montage: { par: "Ana", date: null, ecran: null }, verification: { par: null, date: null, ecran: null },
  });
  const mount = (u: unknown, role: string | null, lang: "fr" | "en" = "fr") => {
    vi.mocked(useApp).mockReturnValue({
      units: [u], batches: [], deliveries: [], operations: [], routes: [],
      settings: { sub: "", proj: "", ops: [] }, template: defaultTemplate(),
      ui: { bureauTab: "reg", query: "", filterStatus: "", openId: "U1", client: role === "client" },
      setUi: vi.fn(), run: vi.fn(), t: I[lang], lang, pending: false,
      user: role ? { id: "u", name: "N", email: "n@test.invalid", role } : null,
    } as unknown as ReturnType<typeof useApp>);
    render(<LangProvider><Bureau /></LangProvider>);
  };

  it.each(["superviseur", "admin"])("Quand %s ouvre une unité avec photo, alors « Voir la photo » ouvre l'URL signée", async (role) => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    vi.mocked(getDefectPhotoUrlAction).mockResolvedValue({ ok: true, photoUrl: "http://127.0.0.1:54399/signed" });
    mount(unit(true), role);
    fireEvent.click(screen.getByText(I.fr.photoView));
    await waitFor(() => expect(open).toHaveBeenCalledWith("http://127.0.0.1:54399/signed", "_blank", "noopener,noreferrer"));
    expect(getDefectPhotoUrlAction).toHaveBeenCalledWith({ unitId: "U1", eventId: "E1" });
  });
  it("Quand la langue est l'anglais, alors « View photo »", () => {
    mount(unit(true), "admin", "en");
    expect(screen.getByText("View photo")).toBeTruthy();
  });
  it.each([
    ["un client", "client"],
    ["un écran appairé sans compte staff", null],
    ["un rôle inconnu", "operateur"],
  ])("Quand %s ouvre la fiche, alors aucun bouton photo", (_, role) => {
    mount(unit(true), role);
    expect(screen.queryByText(I.fr.photoView)).toBeNull();
  });
  it.each([["sans photo", unit(false)], ["sans essai", unit(true, null)]])("Quand l'unité est %s, alors aucun bouton", (_, u) => {
    mount(u, "admin");
    expect(screen.queryByText(I.fr.photoView)).toBeNull();
  });
  it("Quand le serveur refuse, alors un toast traduit, aucune fenêtre", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    vi.mocked(getDefectPhotoUrlAction).mockResolvedValue({ ok: false, error: "PHOTO_NOT_FOUND" });
    mount(unit(true), "admin");
    fireEvent.click(screen.getByText(I.fr.photoView));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(I.fr.errors.PHOTO_NOT_FOUND));
    expect(open).not.toHaveBeenCalled();
  });
  it("Quand l'appel échoue (réseau), alors le toast réseau", async () => {
    vi.mocked(getDefectPhotoUrlAction).mockRejectedValue(new Error("down"));
    mount(unit(true), "admin");
    fireEvent.click(screen.getByText(I.fr.photoView));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(I.fr.errors.network));
  });
});
