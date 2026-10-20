import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));
vi.mock("@/lib/queries", () => ({ loadSnapshot: vi.fn() }));
vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/components/app-context", () => ({ AppProvider: () => null }));
vi.mock("@/components/app-root", () => ({ AppRoot: () => null }));
vi.mock("@/components/db-setup-notice", () => ({ DbSetupNotice: () => null }));

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
});

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
