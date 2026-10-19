import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

// #5, TDD §12 B7 : le drapeau n'assouplit que l'acteur entièrement nul.
describe("withAccess — Étant donné le drapeau ACCESS_ENFORCE_FLOOR (#5)", () => {
  const revokedCookie = async () => {
    (await cookies()).set(kioskCookieName(), "jeton-revoque");
    db.kiosk.findUnique.mockResolvedValue({ id: "k1", label: "É", revokedAt: new Date(), lastSeenAt: null });
  };
  const pairedCookie = async () => {
    (await cookies()).set(kioskCookieName(), "jeton");
    db.kiosk.findUnique.mockResolvedValue({ id: "k7", label: "Établi 2", revokedAt: null, lastSeenAt: new Date() });
  };
  afterEach(() => vi.unstubAllEnvs());

  describe("drapeau éteint", () => {
    beforeEach(() => {
      vi.stubEnv("ACCESS_ENFORCE_FLOOR", "false");
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    it("Quand un client sans écran crée un lot, alors FORBIDDEN, sans appeler l'action", async () => {
      setSession(PROFILES.client.session);
      expect(await withAccess("createBatchAction", handler)({})).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(handler).not.toHaveBeenCalled();
    });
    it("Quand un écran révoqué crée un lot, alors KIOSK_REVOKED", async () => {
      await revokedCookie();
      expect(await withAccess("createBatchAction", handler)({})).toEqual({ ok: false, error: "KIOSK_REVOKED" });
      expect(handler).not.toHaveBeenCalled();
    });
    it("Quand un banni crée un lot, alors FORBIDDEN (il n'est pas l'acteur nul)", async () => {
      setSession(PROFILES.banni.session);
      expect(await withAccess("createBatchAction", handler)({})).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(handler).not.toHaveBeenCalled();
    });
    it("Quand un rôle inconnu recharge les données, alors FORBIDDEN (B6)", async () => {
      setSession(PROFILES.inconnu.session);
      expect(await withAccess("getLiveDataAction", handler)({})).toEqual({ ok: false, error: "FORBIDDEN" });
    });
    it("Quand un anonyme sans cookie crée un lot ou recharge, alors il passe (comportement d'aujourd'hui)", async () => {
      expect(await withAccess("createBatchAction", handler)({})).toEqual({ ok: true });
      expect(await withAccess("getLiveDataAction", handler)({})).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledWith({}, PROFILES.anonyme.actor);
    });
  });

  describe("drapeau posé", () => {
    beforeEach(() => vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true"));
    it("Quand un anonyme sans cookie écrit ou recharge, alors AUTH_REQUIRED, sans aucune lecture de base au-delà de la session", async () => {
      for (const name of ["createBatchAction", "confirmMontageAction", "getLiveDataAction"] as const) {
        expect(await withAccess(name, handler)({})).toEqual({ ok: false, error: "AUTH_REQUIRED" });
      }
      expect(handler).not.toHaveBeenCalled();
    });
    it("Quand un client est sur un écran appairé, alors il écrit au titre de l'écran (NB-b)", async () => {
      await pairedCookie();
      setSession(PROFILES.client.session);
      expect(await withAccess("confirmMontageAction", handler)({})).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledWith({}, { ...PROFILES.client.actor, kiosk: { id: "k7", label: "Établi 2" } });
    });
    it("Quand un client sans écran recharge, alors il lit (READ : tout compte valide)", async () => {
      setSession(PROFILES.client.session);
      expect(await withAccess("getLiveDataAction", handler)({})).toEqual({ ok: true });
    });
    it("Quand un écran appairé sans compte écrit, alors il passe", async () => {
      await pairedCookie();
      expect(await withAccess("createBatchAction", handler)({})).toEqual({ ok: true });
    });
  });
});
