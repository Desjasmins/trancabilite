import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));
vi.mock("@/lib/queries", () => ({ loadSnapshot: vi.fn() }));
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

const snapshot = {
  units: [], batches: [], deliveries: [], operations: [], routes: [],
  settings: { sub: "S", proj: "P", ops: ["Ana"] },
  template: { ...defaultTemplate(), presetId: "gabarit-maison" },
};
type Props = { initial: typeof snapshot; user: { role: string | null; email: string } | null };

beforeEach(() => {
  vi.mocked(loadSnapshot).mockReset().mockResolvedValue(snapshot as never);
  setSession(null);
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
});

