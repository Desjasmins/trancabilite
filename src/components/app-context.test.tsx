// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

vi.mock("@/app/actions", () => ({ getLiveDataAction: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/realtime", () => ({
  subscribeSync: () => () => {}, notifyChange: vi.fn(), realtimeEnabled: () => false,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import { LangProvider } from "./lang-provider";
import { AppProvider, useApp } from "./app-context";
import type { ActionResult } from "@/app/actions";
import { I } from "@/lib/i18n";
import type { Snapshot } from "@/lib/types";

afterEach(() => { cleanup(); vi.mocked(toast.error).mockClear(); });

const initial = { units: [], batches: [], deliveries: [], operations: [], routes: [],
  settings: { sub: "", proj: "", ops: [] }, template: {} } as unknown as Snapshot;

async function runWith(p: Promise<ActionResult>): Promise<ActionResult> {
  let run: ReturnType<typeof useApp>["run"] | null = null;
  function Probe() { run = useApp().run; return null; }
  render(<LangProvider><AppProvider initial={initial} user={null}><Probe /></AppProvider></LangProvider>);
  let res: ActionResult = { ok: true };
  await act(async () => { res = await run!(p); });
  return res;
}

describe("run() — Étant donné le résultat d'une Server Action (#3)", () => {
  it("Quand le serveur refuse avec FORBIDDEN, alors le toast affiche le texte traduit", async () => {
    const res = await runWith(Promise.resolve({ ok: false, error: "FORBIDDEN" }));
    expect(toast.error).toHaveBeenCalledWith(I.fr.errors.FORBIDDEN);
    expect(res.ok).toBe(false);
  });
  it("Quand l'appel lui-même échoue (réseau), alors le texte réseau, jamais le message brut", async () => {
    const res = await runWith(Promise.reject(new Error("fetch failed")));
    expect(toast.error).toHaveBeenCalledWith(I.fr.errors.network);
    expect(res).toEqual({ ok: false, error: I.fr.errors.network });
  });
});
