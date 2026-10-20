import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Jeton d'écran d'atelier (#4). Le jeton (256 bits) ne vit que dans le cookie ; la base ne
 * garde que son empreinte SHA-256 (`Kiosk.tokenHash`).
 *
 * `__Host-` exige Secure : Chrome et Firefox l'acceptent sur http://localhost, Safari ne le
 * garantit pas. Hors production : nom de repli sans préfixe, sans Secure (PLAN #4, point a).
 */
const PROD_NAME = "__Host-lb_kiosk";
const DEV_NAME = "lb_kiosk_dev";

/** 400 jours : plafond des navigateurs pour un cookie. */
export const KIOSK_MAX_AGE = 400 * 24 * 60 * 60;

/** `lastSeenAt` et le cookie ne sont rafraîchis qu'au-delà de ce délai (mode action). */
export const KIOSK_SEEN_EVERY_MS = 5 * 60 * 1000;

export function kioskCookieName(env: string | undefined = process.env.NODE_ENV): string {
  return env === "production" ? PROD_NAME : DEV_NAME;
}

export function kioskCookieOptions(env: string | undefined = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    secure: env === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: KIOSK_MAX_AGE,
  };
}

export function newKioskToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashKioskToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
