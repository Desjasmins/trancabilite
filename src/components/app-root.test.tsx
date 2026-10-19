// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/usb", () => ({ tryReconnectUSB: vi.fn() }));
vi.mock("./app-context", () => ({ useApp: vi.fn() }));
vi.mock("./atelier", () => ({ Atelier: () => <div>vue-atelier</div> }));
vi.mock("./bureau", () => ({ Bureau: () => <div>vue-bureau</div> }));
vi.mock("./login-gate", () => ({ LoginGate: () => <div>vue-connexion</div> }));
vi.mock("./kiosk-panel", () => ({ ThisScreen: ({ screen }: { screen: { status: string } }) => <div>vue-ecran-{screen.status}</div> }));

import { useApp } from "./app-context";
import { AppRoot } from "./app-root";
import { defaultTemplate } from "@/lib/label";
import { I } from "@/lib/i18n";

afterEach(cleanup);

const ctx = (ui: Record<string, unknown>, role: string | null, setUi = vi.fn()) => ({
  units: [], template: defaultTemplate(), t: I.fr, lang: "fr", setLang: vi.fn(), setUi,
  ui: { mode: "atelier", station: null, screen: false, bureauTab: "reg", client: false, ...ui },
  user: role ? { id: "u", name: "Ada", email: "a@test.invalid", role } : null,
}) as unknown as ReturnType<typeof useApp>;

describe("AppRoot — onglets des écrans d'atelier (#4)", () => {
  it("Quand on touche « Cet écran » à l'atelier, alors l'onglet s'ouvre, poste désélectionné", () => {
    const setUi = vi.fn();
    vi.mocked(useApp).mockReturnValue(ctx({}, null, setUi));
    render(<AppRoot screen={{ status: "none" }} />);
    fireEvent.click(screen.getByText(I.fr.tabThisScreen));
    expect(setUi).toHaveBeenCalledWith({ station: null, screen: true, scanUnit: null });
  });

  it("Quand l'onglet « Cet écran » est actif, alors la vue de l'écran reçoit l'état résolu au serveur", () => {
    vi.mocked(useApp).mockReturnValue(ctx({ screen: true }, null));
    render(<AppRoot screen={{ status: "revoked" }} />);
    expect(screen.getByText("vue-ecran-revoked")).toBeTruthy();
    expect(screen.queryByText("vue-atelier")).toBeNull();
  });

  it("Quand on choisit un poste, alors l'onglet « Cet écran » se ferme", () => {
    const setUi = vi.fn();
    vi.mocked(useApp).mockReturnValue(ctx({ screen: true }, null, setUi));
    render(<AppRoot screen={{ status: "none" }} />);
    fireEvent.click(screen.getByText(I.fr.stations.montage));
    expect(setUi).toHaveBeenCalledWith(expect.objectContaining({ station: "montage", screen: false }));
  });

  it.each([["admin", true], ["superviseur", false], ["client", false]])(
    "Quand %s est au Bureau, alors l'onglet « Écrans d'atelier » visible : %s",
    (role, visible) => {
      vi.mocked(useApp).mockReturnValue(ctx({ mode: "bureau" }, role));
      render(<AppRoot screen={{ status: "none" }} />);
      expect(screen.queryByText(I.fr.tabStations) !== null).toBe(visible);
    },
  );
});
