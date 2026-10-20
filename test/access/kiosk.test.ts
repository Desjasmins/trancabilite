import { describe, it, expect } from "vitest";
import {
  newKioskToken, hashKioskToken, kioskCookieName, kioskCookieOptions, KIOSK_MAX_AGE,
} from "@/lib/access/kiosk";

describe("jeton d'écran (#4) — Étant donné le cookie d'appairage", () => {
  it("Quand on hache un jeton, alors c'est l'empreinte SHA-256 hexadécimale", () => {
    // Valeur de référence : sha256("abc").
    expect(hashKioskToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("Quand on tire deux jetons, alors ils diffèrent et portent 256 bits", () => {
    const a = newKioskToken();
    const b = newKioskToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("Quand on est en production, alors cookie __Host-lb_kiosk, Secure, httpOnly, Lax, Path=/, 400 jours", () => {
    expect(kioskCookieName("production")).toBe("__Host-lb_kiosk");
    expect(kioskCookieOptions("production")).toEqual({
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60,
    });
    expect(KIOSK_MAX_AGE).toBe(34_560_000);
  });

  it.each(["development", "test", undefined])(
    "Quand NODE_ENV vaut %s, alors nom de repli sans préfixe __Host- et sans Secure (http://localhost)",
    (env) => {
      expect(kioskCookieName(env)).toBe("lb_kiosk_dev");
      expect(kioskCookieOptions(env).secure).toBe(false);
      expect(kioskCookieOptions(env).httpOnly).toBe(true);
    },
  );
});
