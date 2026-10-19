import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));
vi.mock("@/lib/queries", () => ({ loadSnapshot: vi.fn() }));
vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/components/app-context", () => ({ AppProvider: () => null }));
vi.mock("@/components/app-root", () => ({ AppRoot: () => null }));
vi.mock("@/components/db-setup-notice", () => ({ DbSetupNotice: () => null }));
vi.mock("@/components/kiosk-panel", () => ({ UnregisteredGate: () => null }));

import Home from "@/app/page";
import { loadSnapshot } from "@/lib/queries";
import { AppProvider } from "@/components/app-context";
import { DbSetupNotice } from "@/components/db-setup-notice";
import { defaultTemplate } from "@/lib/label";
import { setSession } from "../mocks/auth";
import { PROFILES } from "../access/profiles";
import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "../mocks/db";
import { cookies, resetHeadersMock } from "../mocks/headers";
import { kioskCookieName } from "@/lib/access/kiosk";
import { AppRoot } from "@/components/app-root";
import { UnregisteredGate } from "@/components/kiosk-panel";

const db = prisma as unknown as PrismaMock;

const snapshot = {
  units: [], batches: [], deliveries: [], operations: [], routes: [],
  settings: { sub: "S", proj: "P", ops: ["Ana"] },
  template: { ...defaultTemplate(), presetId: "gabarit-maison" },
};
type Props = { initial: typeof snapshot; user: { role: string | null; email: string } | null };

beforeEach(() => {
  vi.mocked(loadSnapshot).mockReset().mockResolvedValue(snapshot as never);
  setSession(null);
  resetDbMock();
  resetHeadersMock();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("page d'accueil — Étant donné l'acteur résolu au rendu (#3)", () => {
  it("Quand un client ouvre la page, alors ni opérateurs ni gabarit dans l'instantané", async () => {
    setSession(PROFILES.client.session);
    const el = (await Home()) as ReactElement<Props>;
    expect(el.type).toBe(AppProvider);
    expect(el.props.initial.settings.ops).toEqual([]);
    expect(el.props.initial.template).toEqual(defaultTemplate());
    expect(el.props.user).toEqual({ id: "u-client", name: "Cléo", email: "u-client@test.invalid", role: "client" });
  });

  it("Quand un admin ouvre la page, alors l'instantané complet", async () => {
    setSession(PROFILES.admin.session);
    const el = (await Home()) as ReactElement<Props>;
    expect(el.props.initial).toBe(snapshot);
  });

  it("Quand un banni ouvre la page, alors aucun utilisateur", async () => {
    setSession(PROFILES.banni.session);
    const el = (await Home()) as ReactElement<Props>;
    expect(el.props.user).toBeNull();
  });

  it("(régression : NB9) Quand la base échoue, alors l'encart sans message brut, détail au journal serveur", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadSnapshot).mockRejectedValue(new Error("postgresql://user:motdepasse@hote"));
    const el = (await Home()) as ReactElement<Record<string, unknown>>;
    expect(el.type).toBe(DbSetupNotice);
    expect(el.props).toEqual({});
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("(régression : R1) Quand l'identité change sans recharger, alors AppProvider change de key et repart de l'instantané projeté", async () => {
    const keyFor = async (profile: keyof typeof PROFILES) => {
      setSession(PROFILES[profile].session);
      return ((await Home()) as ReactElement).key;
    };
    const anon = await keyFor("anonyme");
    const client = await keyFor("client");
    const admin = await keyFor("admin");
    const inconnu = await keyFor("inconnu"); // rôle hors liste : sa propre identité aussi
    expect(new Set([anon, client, admin, inconnu]).size).toBe(4);
    expect(await keyFor("client")).toBe(client); // même identité → même état conservé
  });

  describe("état de l'écran passé à AppRoot (#4)", () => {
    const screenOf = async () => {
      const el = (await Home()) as ReactElement<{ children: ReactElement<{ screen: unknown }> }>;
      expect(el.props.children.type).toBe(AppRoot);
      return el.props.children.props.screen;
    };
    it("Quand aucun cookie, alors « none »", async () => {
      expect(await screenOf()).toEqual({ status: "none" });
    });
    it("Quand l'écran est appairé, alors son nom, sans rien écrire au rendu", async () => {
      (await cookies()).set(kioskCookieName(), "j");
      db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "Établi 2", revokedAt: null, lastSeenAt: null });
      expect(await screenOf()).toEqual({ status: "paired", label: "Établi 2" });
      expect(db.kiosk.update).not.toHaveBeenCalled();
    });
    it("Quand l'état de l'écran change (aucun → appairé → révoqué), alors AppProvider change de key (tour 2)", async () => {
      const keyNow = async () => ((await Home()) as ReactElement).key;
      const none = await keyNow();
      (await cookies()).set(kioskCookieName(), "j");
      db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "É", revokedAt: null, lastSeenAt: new Date() });
      const paired = await keyNow();
      db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "É", revokedAt: new Date(), lastSeenAt: null });
      const revoked = await keyNow();
      expect(new Set([none, paired, revoked]).size).toBe(3);
    });
    it("Quand l'écran est révoqué, alors « revoked »", async () => {
      (await cookies()).set(kioskCookieName(), "j");
      db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "É", revokedAt: new Date(), lastSeenAt: null });
      expect(await screenOf()).toEqual({ status: "revoked" });
    });
  });
});

// #5 : READ au chargement de la page, drapeau ACCESS_ENFORCE_FLOOR.
describe("page d'accueil — Étant donné la garde de l'atelier (#5)", () => {
  type GateProps = { initial: Record<string, unknown>; user: unknown; live?: boolean; floorGuardOff?: boolean;
    children: ReactElement<{ screen: unknown }> };
  const home = async () => (await Home()) as ReactElement<GateProps>;

  it("Quand le drapeau est posé et qu'un anonyme sans cookie ouvre la page, alors connexion + écran non enregistré, sans aucune lecture des données", async () => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true");
    const el = await home();
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(el.type).toBe(AppProvider);
    expect(el.props.live).toBe(false);
    expect(el.props.user).toBeNull();
    expect(el.props.children.type).toBe(UnregisteredGate);
    expect(el.props.children.props.screen).toEqual({ status: "none" });
    // Aucun instantané : rien du registre, ni opérateurs, ni gabarit maison.
    const initial = el.props.initial as typeof snapshot;
    expect([initial.units, initial.batches, initial.deliveries, initial.operations, initial.routes, initial.settings.ops])
      .toEqual([[], [], [], [], [], []]);
    expect(initial.template).toEqual(defaultTemplate());
  });

  it("Quand le drapeau est posé et que l'écran est révoqué, alors la porte affiche l'écran révoqué, sans données", async () => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true");
    (await cookies()).set(kioskCookieName(), "j");
    db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "É", revokedAt: new Date(), lastSeenAt: null });
    const el = await home();
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(el.props.children.props.screen).toEqual({ status: "revoked" });
  });

  it("Quand le drapeau est éteint et que l'écran est révoqué, alors aussi refusé (le drapeau n'assouplit que l'acteur nul)", async () => {
    (await cookies()).set(kioskCookieName(), "j");
    db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "É", revokedAt: new Date(), lastSeenAt: null });
    expect((await home()).props.children.type).toBe(UnregisteredGate);
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it("Quand le drapeau est éteint et qu'un anonyme sans cookie ouvre la page, alors l'atelier comme aujourd'hui", async () => {
    const el = await home();
    expect(el.props.children.type).toBe(AppRoot);
    expect(el.props.initial).toBe(snapshot);
  });

  it("Quand un rôle inconnu ouvre la page, alors la porte, même drapeau éteint (B6)", async () => {
    setSession(PROFILES.inconnu.session);
    expect((await home()).props.children.type).toBe(UnregisteredGate);
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it("Quand le drapeau est posé et qu'un écran appairé ouvre la page, alors l'atelier complet", async () => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true");
    (await cookies()).set(kioskCookieName(), "j");
    db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "Établi 2", revokedAt: null, lastSeenAt: new Date() });
    const el = await home();
    expect(el.props.children.type).toBe(AppRoot);
    expect(el.props.initial).toBe(snapshot);
  });

  it("Quand le drapeau est éteint, alors floorGuardOff pour l'admin seulement", async () => {
    setSession(PROFILES.admin.session);
    expect((await home()).props.floorGuardOff).toBe(true);
    setSession(PROFILES.superviseur.session);
    expect((await home()).props.floorGuardOff).toBe(false);
    setSession(null);
    expect((await home()).props.floorGuardOff).toBe(false);
  });

  it("Quand le drapeau est posé, alors aucun bandeau, même pour l'admin", async () => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true");
    setSession(PROFILES.admin.session);
    expect((await home()).props.floorGuardOff).toBe(false);
  });
});
