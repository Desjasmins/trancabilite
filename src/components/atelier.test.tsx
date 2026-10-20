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
import { markPrintedAction } from "@/app/actions";
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
