import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));
vi.mock("@/lib/db", () => import("../mocks/db"));

import { getActor } from "@/lib/access/actor";
import { auth, setSession, sessionFor } from "../mocks/auth";
import { setHeaders, resetHeadersMock, cookies, cookieOptionsOf } from "../mocks/headers";
import { prisma } from "@/lib/db";
import { resetDbMock, MODEL_DELEGATES, type PrismaMock } from "../mocks/db";
import { hashKioskToken, kioskCookieName } from "@/lib/access/kiosk";
import { PROFILES, PROFILE_NAMES, NO_KIOSK } from "./profiles";

const db = prisma as unknown as PrismaMock;
const COOKIE = kioskCookieName();

beforeEach(() => {
  resetHeadersMock();
  resetDbMock();
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
    expect(await getActor({ mode: "action" })).toEqual({ user: null, ...NO_KIOSK });
  });
});

/** Pose le cookie d'écran sur la requête bouchonnée. */
async function withKioskCookie(token: string) {
  (await cookies()).set(COOKIE, token);
}
function kioskRow(over: Record<string, unknown> = {}) {
  return {
    id: "k1", label: "Établi 2", tokenHash: hashKioskToken("jeton-k1"), createdById: "u-admin",
    createdAt: new Date("2026-10-01T00:00:00Z"), lastSeenAt: new Date(), revokedAt: null, ...over,
  };
}
function prismaCallsExceptKioskFind(): number {
  let n = db.$transaction.mock.calls.length;
  for (const m of MODEL_DELEGATES) for (const [k, fn] of Object.entries(db[m])) {
    if (m === "kiosk" && (k === "findUnique" || k === "update")) continue;
    n += fn.mock.calls.length;
  }
  return n;
}

describe("getActor — Étant donné le cookie d'écran d'atelier (#4)", () => {
  it("Quand aucun cookie, alors aucun écran et aucune lecture de la table kiosks", async () => {
    expect(await getActor({ mode: "action" })).toEqual({ user: null, kiosk: null, kioskRevoked: false });
    expect(db.kiosk.findUnique).not.toHaveBeenCalled();
  });

  it("Quand le cookie est inconnu en base, alors il compte comme absent (pas révoqué, §13)", async () => {
    await withKioskCookie("jeton-inconnu");
    db.kiosk.findUnique.mockResolvedValue(null);
    expect(await getActor({ mode: "action" })).toEqual({ user: null, kiosk: null, kioskRevoked: false });
    expect(db.kiosk.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashKioskToken("jeton-inconnu") } });
  });

  it("Quand l'écran est révoqué, alors kiosk null et kioskRevoked vrai, sans rafraîchir", async () => {
    await withKioskCookie("jeton-k1");
    db.kiosk.findUnique.mockResolvedValue(kioskRow({ revokedAt: new Date(), lastSeenAt: null }));
    expect(await getActor({ mode: "action" })).toEqual({ user: null, kiosk: null, kioskRevoked: true });
    expect(db.kiosk.update).not.toHaveBeenCalled();
  });

  it("Quand l'écran est valide, alors l'acteur porte l'écran ET l'utilisateur", async () => {
    await withKioskCookie("jeton-k1");
    setSession(PROFILES.client.session);
    db.kiosk.findUnique.mockResolvedValue(kioskRow());
    expect(await getActor({ mode: "action" })).toEqual({
      user: PROFILES.client.actor.user, kiosk: { id: "k1", label: "Établi 2" }, kioskRevoked: false,
    });
  });

  it("Quand on rend la page avec un écran vu il y a longtemps, alors rien n'est écrit (ni cookie ni lastSeenAt)", async () => {
    await withKioskCookie("jeton-k1");
    db.kiosk.findUnique.mockResolvedValue(kioskRow({ lastSeenAt: null }));
    await getActor({ mode: "render" });
    expect(db.kiosk.update).not.toHaveBeenCalled();
    expect(cookieOptionsOf(COOKIE)).toBeUndefined();
  });

  it.each([
    ["jamais vu", null],
    ["vu il y a 6 minutes", new Date(Date.now() - 6 * 60_000)],
  ])("Quand une action vient d'un écran %s, alors lastSeenAt est rafraîchi et le cookie renouvelé 400 jours", async (_l, seen) => {
    await withKioskCookie("jeton-k1");
    db.kiosk.findUnique.mockResolvedValue(kioskRow({ lastSeenAt: seen }));
    await getActor({ mode: "action" });
    expect(db.kiosk.update).toHaveBeenCalledWith({ where: { id: "k1" }, data: { lastSeenAt: expect.any(Date) } });
    expect((await cookies()).get(COOKIE)?.value).toBe("jeton-k1");
    expect(cookieOptionsOf(COOKIE)).toEqual({
      httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60,
    });
    expect(prismaCallsExceptKioskFind()).toBe(0);
  });

  it("Quand une action vient d'un écran vu il y a 4 minutes, alors rien n'est écrit", async () => {
    await withKioskCookie("jeton-k1");
    db.kiosk.findUnique.mockResolvedValue(kioskRow({ lastSeenAt: new Date(Date.now() - 4 * 60_000) }));
    await getActor({ mode: "action" });
    expect(db.kiosk.update).not.toHaveBeenCalled();
    expect(cookieOptionsOf(COOKIE)).toBeUndefined();
  });

  it("Quand l'utilisateur est banni sur un écran valide, alors user null mais l'écran reste", async () => {
    await withKioskCookie("jeton-k1");
    setSession(PROFILES.banni.session);
    db.kiosk.findUnique.mockResolvedValue(kioskRow());
    expect(await getActor({ mode: "action" })).toEqual({ user: null, kiosk: { id: "k1", label: "Établi 2" }, kioskRevoked: false });
  });
});
