import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

import { getActor } from "@/lib/access/actor";
import { auth, setSession, sessionFor } from "../mocks/auth";
import { setHeaders, resetHeadersMock } from "../mocks/headers";
import { PROFILES, PROFILE_NAMES } from "./profiles";

beforeEach(() => {
  resetHeadersMock();
  auth.api.getSession.mockReset().mockResolvedValue(null);
});

describe("getActor — Étant donné une session Better Auth", () => {
  it.each(PROFILE_NAMES)("Quand le profil est %s, alors l'acteur est celui de la matrice", async (name) => {
    setSession(PROFILES[name].session);
    expect(await getActor({ mode: "action" })).toEqual(PROFILES[name].actor);
  });

  it("Quand on rend la page, alors la session est lue avec les en-têtes de la requête", async () => {
    setHeaders({ cookie: "better-auth.session_token=factice" });
    setSession(PROFILES.admin.session);
    expect(await getActor({ mode: "render" })).toEqual(PROFILES.admin.actor);
    const arg = auth.api.getSession.mock.calls[0]?.[0];
    expect(arg?.headers.get("cookie")).toBe("better-auth.session_token=factice");
  });

  it("Quand le rôle est absent, alors role = null (aucun droit)", async () => {
    setSession(sessionFor({ id: "u", name: "N", email: "n@test.invalid", role: null }));
    expect((await getActor({ mode: "action" })).user?.role).toBeNull();
  });

  it("Quand banned vaut false, alors l'utilisateur est gardé", async () => {
    setSession(sessionFor({ id: "u", name: "N", email: "n@test.invalid", role: "admin", banned: false }));
    expect((await getActor({ mode: "action" })).user?.role).toBe("admin");
  });

  it("Quand banned vaut true, alors aucun utilisateur, quel que soit le rôle (Better Auth ne filtre pas)", async () => {
    setSession(sessionFor({ id: "u", name: "N", email: "n@test.invalid", role: "superviseur", banned: true }));
    expect(await getActor({ mode: "action" })).toEqual({ user: null });
  });
});
