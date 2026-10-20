import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));
vi.mock("@/lib/db", () => import("../mocks/db"));

import { withAccess } from "@/lib/access/with-access";
import type { ActionName } from "@/app/actions/policies";
import { auth, setSession } from "../mocks/auth";
import { PROFILES } from "./profiles";
import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "../mocks/db";
import { cookies, resetHeadersMock } from "../mocks/headers";
import { kioskCookieName } from "@/lib/access/kiosk";

const db = prisma as unknown as PrismaMock;

const handler = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  handler.mockClear();
  resetDbMock();
  resetHeadersMock();
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

  it("Quand un écran révoqué appelle une action d'atelier, alors KIOSK_REVOKED sans appeler l'action (#4)", async () => {
    (await cookies()).set(kioskCookieName(), "jeton-revoque");
    db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "É", revokedAt: new Date(), lastSeenAt: null });
    expect(await withAccess("confirmMontageAction", handler)({})).toEqual({ ok: false, error: "KIOSK_REVOKED" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("Quand un superviseur est connecté sur un écran révoqué, alors l'action passe, sans écran (NB-a)", async () => {
    (await cookies()).set(kioskCookieName(), "jeton-revoque");
    db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "É", revokedAt: new Date(), lastSeenAt: null });
    setSession(PROFILES.superviseur.session);
    expect(await withAccess("confirmMontageAction", handler)({})).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith({}, { ...PROFILES.superviseur.actor, kioskRevoked: true });
  });

  it("Quand un admin appelle une action ADMIN_WRITE, alors elle passe ; un superviseur, FORBIDDEN", async () => {
    setSession(PROFILES.admin.session);
    expect(await withAccess("pairKioskAction", handler)({})).toEqual({ ok: true });
    setSession(PROFILES.superviseur.session);
    expect(await withAccess("pairKioskAction", handler)({})).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});
