import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

import { withAccess } from "@/lib/access/with-access";
import type { ActionName } from "@/app/actions/policies";
import { auth, setSession } from "../mocks/auth";
import { PROFILES } from "./profiles";

const handler = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  handler.mockClear();
  auth.api.getSession.mockReset().mockResolvedValue(null);
});

describe("withAccess — Étant donné le tableau POLICIES", () => {
  it("Quand le nom est absent du tableau, alors FORBIDDEN sans lire la session ni appeler l'action", async () => {
    const guarded = withAccess("actionInconnue" as ActionName, handler);
    expect(await guarded({})).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(handler).not.toHaveBeenCalled();
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it("Quand le nom est un membre hérité d'Object (toString), alors FORBIDDEN", async () => {
    expect(await withAccess("toString" as ActionName, handler)({})).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("Quand un anonyme appelle une action STAFF_WRITE, alors AUTH_REQUIRED", async () => {
    expect(await withAccess("saveSettingsAction", handler)({})).toEqual({ ok: false, error: "AUTH_REQUIRED" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("Quand un client appelle une action STAFF_WRITE, alors FORBIDDEN", async () => {
    setSession(PROFILES.client.session);
    expect(await withAccess("saveSettingsAction", handler)({})).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("Quand un superviseur appelle, alors l'action reçoit l'entrée et l'acteur serveur", async () => {
    setSession(PROFILES.superviseur.session);
    const input = { a: 1 };
    expect(await withAccess("saveSettingsAction", handler)(input)).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith(input, PROFILES.superviseur.actor);
  });

  it("Quand l'action lève, alors GENERIC et le détail part au journal serveur seulement", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    setSession(PROFILES.admin.session);
    const boom = vi.fn(async () => { throw new Error("secret de connexion"); });
    expect(await withAccess("saveSettingsAction", boom)({})).toEqual({ ok: false, error: "GENERIC" });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("Quand la lecture de session lève, alors GENERIC, sans appeler l'action", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.api.getSession.mockRejectedValue(new Error("base injoignable"));
    expect(await withAccess("confirmMontageAction", handler)({})).toEqual({ ok: false, error: "GENERIC" });
    expect(handler).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
