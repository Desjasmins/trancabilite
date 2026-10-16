// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions", () => ({ saveTemplateAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/usb", () => ({ connectUSB: vi.fn(), isUsbConnected: () => false }));
vi.mock("./app-context", () => ({ useApp: vi.fn() }));

import { toast } from "sonner";
import { saveTemplateAction } from "@/app/actions";
import { useApp } from "./app-context";
import { LabelEditor } from "./label-editor";
import { defaultTemplate } from "@/lib/label";
import { I } from "@/lib/i18n";

const template = defaultTemplate();
const setTemplate = vi.fn();

beforeEach(() => {
  setTemplate.mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(useApp).mockReturnValue({
    settings: { sub: "S", proj: "P", ops: [] }, template, setTemplate,
    ui: { client: false, selPart: "header" }, setUi: vi.fn(), t: I.fr,
  } as unknown as ReturnType<typeof useApp>);
});
afterEach(cleanup);

function changeWidth() {
  render(<LabelEditor />);
  const input = screen.getByDisplayValue(String(template.w));
  fireEvent.change(input, { target: { value: String(template.w + 10) } });
}

describe("LabelEditor — Étant donné une modification du gabarit (#3, D12)", () => {
  it("Quand le serveur accepte, alors le gabarit modifié reste affiché", async () => {
    vi.mocked(saveTemplateAction).mockResolvedValue({ ok: true });
    changeWidth();
    await waitFor(() => expect(saveTemplateAction).toHaveBeenCalled());
    expect(setTemplate).toHaveBeenCalledTimes(1);
    expect(setTemplate.mock.calls[0][0].w).toBe(template.w + 10);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("Quand le serveur refuse, alors l'écran revient au gabarit enregistré et le refus est traduit", async () => {
    vi.mocked(saveTemplateAction).mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    changeWidth();
    await waitFor(() => expect(setTemplate).toHaveBeenLastCalledWith(template));
    expect(toast.error).toHaveBeenCalledWith(I.fr.errors.FORBIDDEN);
  });

  it("Quand l'appel échoue (réseau), alors retour au gabarit enregistré et texte réseau", async () => {
    vi.mocked(saveTemplateAction).mockRejectedValue(new Error("fetch failed"));
    changeWidth();
    await waitFor(() => expect(setTemplate).toHaveBeenLastCalledWith(template));
    expect(toast.error).toHaveBeenCalledWith(I.fr.errors.network);
  });
});
