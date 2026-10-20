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
  vi.mocked(saveTemplateAction).mockReset();
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

  it("(course) Quand A est refusé puis B accepté, alors l'écran garde B : le refus de A, dépassé, n'annule rien", async () => {
    let settleA: (v: { ok: boolean; error?: string }) => void = () => {};
    vi.mocked(saveTemplateAction)
      .mockImplementationOnce(() => new Promise((r) => { settleA = r; }))
      .mockResolvedValueOnce({ ok: true });
    render(<LabelEditor />);
    const input = screen.getByDisplayValue(String(template.w));
    fireEvent.change(input, { target: { value: "70" } });  // A
    fireEvent.change(input, { target: { value: "80" } });  // B (le bouchon garde template.w affiché)
    await waitFor(() => expect(saveTemplateAction).toHaveBeenCalledTimes(2));
    settleA({ ok: false, error: "FORBIDDEN" });
    await new Promise((r) => setTimeout(r, 0));
    expect(setTemplate).toHaveBeenCalledTimes(2);
    expect(setTemplate.mock.calls[1][0].w).toBe(80);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("(course) Quand A puis B sont refusés, alors l'écran revient au dernier gabarit CONFIRMÉ, pas à A", async () => {
    vi.mocked(saveTemplateAction).mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    render(<LabelEditor />);
    const input = screen.getByDisplayValue(String(template.w));
    fireEvent.change(input, { target: { value: "70" } });
    fireEvent.change(input, { target: { value: "80" } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(setTemplate).toHaveBeenCalledTimes(3);
    expect(setTemplate).toHaveBeenLastCalledWith(template);
  });

  it("(course) Quand A est accepté puis B refusé, alors retour à A, le dernier confirmé", async () => {
    vi.mocked(saveTemplateAction).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: "FORBIDDEN" });
    render(<LabelEditor />);
    const input = screen.getByDisplayValue(String(template.w));
    fireEvent.change(input, { target: { value: "70" } });
    await waitFor(() => expect(saveTemplateAction).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.change(input, { target: { value: "80" } });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(setTemplate.mock.lastCall?.[0].w).toBe(70);
  });
});

