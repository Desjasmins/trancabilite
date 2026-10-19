// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

vi.mock("@/app/actions", () => ({ getLiveDataAction: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/realtime", () => ({
  subscribeSync: () => () => {}, notifyChange: vi.fn(), realtimeEnabled: () => false,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import { LangProvider } from "./lang-provider";
import { AppProvider, useApp } from "./app-context";
import { getLiveDataAction, type ActionResult } from "@/app/actions";
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

// #5 : la synchro s'arrête quand le serveur retire l'accès, puis la page se recharge.
describe("synchro live — Étant donné un refus d'accès du serveur (#5)", () => {
  const live = vi.mocked(getLiveDataAction);
  beforeEach(() => { live.mockReset(); refresh.mockClear(); });
  const mount = (props: { live?: boolean } = {}) =>
    render(<LangProvider><AppProvider initial={initial} user={null} {...props}><span /></AppProvider></LangProvider>);
  const online = async () => { await act(async () => { window.dispatchEvent(new Event("online")); await Promise.resolve(); }); };

  it.each(["AUTH_REQUIRED", "KIOSK_REVOKED", "FORBIDDEN"])("Quand le rechargement rend %s, alors la synchro s'arrête et la page se recharge une fois", async (code) => {
    live.mockResolvedValue({ ok: false, error: code });
    mount();
    await online();
    expect(live).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await online();
    expect(live).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("Quand le rechargement rend une erreur technique (GENERIC), alors la synchro continue sans recharger", async () => {
    live.mockResolvedValue({ ok: false, error: "GENERIC" });
    mount();
    await online();
    await online();
    expect(live).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Quand deux rechargements en vol rendent AUTH_REQUIRED, alors un seul rechargement de page", async () => {
    let release: (v: ActionResult) => void = () => {};
    live.mockImplementation(() => new Promise<ActionResult>((r) => { release = r; }));
    const releases: Array<(v: ActionResult) => void> = [];
    mount();
    await online(); releases.push(release);
    await online(); releases.push(release);
    await act(async () => { for (const r of releases) r({ ok: false, error: "AUTH_REQUIRED" }); await Promise.resolve(); });
    expect(live).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("Quand le rechargement réussit, alors les données sont appliquées et la synchro continue", async () => {
    live.mockResolvedValue({ ok: true, units: [{ id: "U9" }] } as unknown as ActionResult);
    const seen: number[] = [];
    function Probe() { seen.push(useApp().units.length); return null; }
    render(<LangProvider><AppProvider initial={initial} user={null}><Probe /></AppProvider></LangProvider>);
    await online();
    expect(seen.at(-1)).toBe(1);
    await online();
    expect(live).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Quand live vaut false (porte sans identité), alors aucune synchro", async () => {
    mount({ live: false });
    await online();
    expect(live).not.toHaveBeenCalled();
  });

  it("Quand floorGuardOff est passé, alors useApp l'expose (faux par défaut)", () => {
    const seen: boolean[] = [];
    function Probe() { seen.push(useApp().floorGuardOff); return null; }
    render(<LangProvider><AppProvider initial={initial} user={null} live={false}><Probe /></AppProvider></LangProvider>);
    render(<LangProvider><AppProvider initial={initial} user={null} live={false} floorGuardOff><Probe /></AppProvider></LangProvider>);
    expect(seen).toContain(false);
    expect(seen).toContain(true);
  });
});
