// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions", () => ({
  pairKioskAction: vi.fn(async () => ({ ok: true, kiosks: [] })),
  revokeKioskAction: vi.fn(async () => ({ ok: true, kiosks: [] })),
  renameKioskAction: vi.fn(async () => ({ ok: true, kiosks: [] })),
  listKiosksAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./app-context", () => ({ useApp: vi.fn() }));

const refresh = vi.fn();

import { pairKioskAction, revokeKioskAction, renameKioskAction, listKiosksAction } from "@/app/actions";
import { useApp } from "./app-context";
import { ThisScreen, KioskList } from "./kiosk-panel";
import { I } from "@/lib/i18n";

const run = vi.fn(async (p: Promise<unknown>) => p);
const setUi = vi.fn();
const ctx = (role: string | null, lang: "fr" | "en" = "fr") => ({
  t: I[lang], lang, run, setUi, pending: false,
  user: role ? { id: "u", name: "Ada", email: "a@test.invalid", role } : null,
}) as unknown as ReturnType<typeof useApp>;

const K1 = { id: "k1", label: "Établi 2", createdAt: "2026-10-01T00:00:00.000Z", lastSeenAt: "2026-10-18T08:00:00.000Z", revokedAt: null };
const K2 = { id: "k2", label: "Vieux", createdAt: "2026-09-01T00:00:00.000Z", lastSeenAt: null, revokedAt: "2026-10-02T00:00:00.000Z" };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("ThisScreen — onglet « Cet écran » (#4)", () => {
  it("Quand l'écran n'est pas enregistré et personne n'est connecté, alors le texte d'état et le bouton de connexion admin", () => {
    vi.mocked(useApp).mockReturnValue(ctx(null));
    render(<ThisScreen screen={{ status: "none" }} />);
    expect(screen.getByText(I.fr.stationUnpairedTitle)).toBeTruthy();
    expect(screen.getByText(I.fr.stationUnpairedBody)).toBeTruthy();
    expect(screen.queryByText(I.fr.stationPairBtn)).toBeNull();
    fireEvent.click(screen.getByText(I.fr.stationUnpairedLogin));
    expect(setUi).toHaveBeenCalledWith({ mode: "bureau", station: null, screen: false });
  });

  it("Quand un admin enregistre l'écran, alors l'action reçoit le nom et la page se recharge", async () => {
    vi.mocked(useApp).mockReturnValue(ctx("admin"));
    render(<ThisScreen screen={{ status: "none" }} />);
    expect(screen.getByText(I.fr.stationPairWarn)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(I.fr.stationLabel), { target: { value: "Établi 2" } });
    fireEvent.click(screen.getByText(I.fr.stationPairBtn));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(pairKioskAction).toHaveBeenCalledWith({ label: "Établi 2" });
    expect(run).toHaveBeenCalledWith(expect.any(Promise), I.fr.stationPaired);
  });

  it("Quand l'appairage échoue, alors pas de rechargement", async () => {
    vi.mocked(useApp).mockReturnValue(ctx("admin"));
    vi.mocked(pairKioskAction).mockResolvedValueOnce({ ok: false, error: "FORBIDDEN" });
    render(<ThisScreen screen={{ status: "none" }} />);
    fireEvent.change(screen.getByLabelText(I.fr.stationLabel), { target: { value: "X" } });
    fireEvent.click(screen.getByText(I.fr.stationPairBtn));
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Quand un superviseur est connecté, alors pas de formulaire (réservé à l'admin)", () => {
    vi.mocked(useApp).mockReturnValue(ctx("superviseur"));
    render(<ThisScreen screen={{ status: "none" }} />);
    expect(screen.queryByText(I.fr.stationPairBtn)).toBeNull();
    expect(screen.queryByText(I.fr.stationUnpairedLogin)).toBeNull();
  });

  it("Quand l'écran est enregistré, alors son nom ; révoqué, le texte KIOSK_REVOKED", () => {
    vi.mocked(useApp).mockReturnValue(ctx(null));
    const { rerender } = render(<ThisScreen screen={{ status: "paired", label: "Établi 2" }} />);
    expect(screen.getByText(I.fr.stationPairedAs)).toBeTruthy();
    expect(screen.getByText("Établi 2")).toBeTruthy();
    rerender(<ThisScreen screen={{ status: "revoked" }} />);
    expect(screen.getByText(I.fr.errors.KIOSK_REVOKED)).toBeTruthy();
  });

  it("Quand la langue est l'anglais, alors les textes anglais", () => {
    vi.mocked(useApp).mockReturnValue(ctx("admin", "en"));
    render(<ThisScreen screen={{ status: "none" }} />);
    expect(screen.getByText("Register this screen")).toBeTruthy();
  });
});

describe("KioskList — onglet Bureau « Écrans d'atelier » (#4)", () => {
  it("Quand aucun écran, alors le texte de liste vide", async () => {
    vi.mocked(useApp).mockReturnValue(ctx("admin"));
    vi.mocked(listKiosksAction).mockResolvedValue({ ok: true, kiosks: [] });
    render(<KioskList />);
    await waitFor(() => expect(screen.getByText(I.fr.noStations)).toBeTruthy());
  });

  it("Quand des écrans existent, alors nom, dernière activité, état ; retirer l'accès passe par une confirmation", async () => {
    vi.mocked(useApp).mockReturnValue(ctx("admin"));
    vi.mocked(listKiosksAction).mockResolvedValue({ ok: true, kiosks: [K1, K2] });
    vi.mocked(revokeKioskAction).mockResolvedValue({ ok: true, kiosks: [{ ...K1, revokedAt: "2026-10-19T00:00:00.000Z" }, K2] });
    render(<KioskList />);
    await waitFor(() => expect(screen.getByText("Établi 2")).toBeTruthy());
    expect(screen.getByText(I.fr.stationLastSeen)).toBeTruthy();
    expect(screen.getAllByText(I.fr.stationRevokedL)).toHaveLength(1);
    // Un seul bouton : l'écran déjà révoqué n'en a pas.
    fireEvent.click(screen.getByText(I.fr.stationRevokeBtn));
    expect(revokeKioskAction).not.toHaveBeenCalled();
    expect(screen.getByText(I.fr.stationRevokeConfirm.replace("{label}", "Établi 2"))).toBeTruthy();
    fireEvent.click(screen.getByText(I.fr.stationRevokeYes));
    await waitFor(() => expect(revokeKioskAction).toHaveBeenCalledWith({ id: "k1" }));
    expect(run).toHaveBeenCalledWith(expect.any(Promise), I.fr.stationRevoked);
    await waitFor(() => expect(screen.getAllByText(I.fr.stationRevokedL)).toHaveLength(2));
  });

  it("Quand l'admin renomme un écran, alors l'action reçoit le nouveau nom", async () => {
    vi.mocked(useApp).mockReturnValue(ctx("admin"));
    vi.mocked(listKiosksAction).mockResolvedValue({ ok: true, kiosks: [K1] });
    vi.mocked(renameKioskAction).mockResolvedValue({ ok: true, kiosks: [{ ...K1, label: "Établi 9" }] });
    render(<KioskList />);
    await waitFor(() => expect(screen.getByText("Établi 2")).toBeTruthy());
    fireEvent.click(screen.getByText(I.fr.stationRenameBtn));
    fireEvent.change(screen.getByLabelText(I.fr.stationLabel), { target: { value: "Établi 9" } });
    fireEvent.click(screen.getByText(I.fr.save));
    await waitFor(() => expect(renameKioskAction).toHaveBeenCalledWith({ id: "k1", label: "Établi 9" }));
    await waitFor(() => expect(screen.getByText("Établi 9")).toBeTruthy());
  });

  it("Quand la liste ne charge pas, alors le message d'erreur traduit", async () => {
    vi.mocked(useApp).mockReturnValue(ctx("admin"));
    vi.mocked(listKiosksAction).mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    render(<KioskList />);
    await waitFor(() => expect(screen.getByText(I.fr.errors.FORBIDDEN)).toBeTruthy());
  });

  it("Quand l'admin annule le retrait ou le renommage, alors aucune action n'est appelée", async () => {
    vi.mocked(useApp).mockReturnValue(ctx("admin"));
    vi.mocked(listKiosksAction).mockResolvedValue({ ok: true, kiosks: [K1] });
    render(<KioskList />);
    await waitFor(() => expect(screen.getByText("Établi 2")).toBeTruthy());
    fireEvent.click(screen.getByText(I.fr.stationRevokeBtn));
    fireEvent.click(screen.getByText(I.fr.cancel));
    await waitFor(() => expect(screen.queryByText(I.fr.stationRevokeYes)).toBeNull());
    fireEvent.click(screen.getByText(I.fr.stationRenameBtn));
    fireEvent.click(screen.getByText(I.fr.cancel));
    await waitFor(() => expect(screen.queryByLabelText(I.fr.stationLabel)).toBeNull());
    expect(revokeKioskAction).not.toHaveBeenCalled();
    expect(renameKioskAction).not.toHaveBeenCalled();
  });
});
