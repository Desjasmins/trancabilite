import type { Dict } from "@/lib/i18n";

/**
 * Codes d'erreur renvoyés par les Server Actions (#3) et traduits côté client.
 * Sans "server-only" : `run()` et l'éditeur de gabarit (client) les lisent.
 */
export type AccessError = "AUTH_REQUIRED" | "FORBIDDEN" | "KIOSK_REVOKED";
/** Refus métier des écrans d'atelier (#4), traduits comme les codes d'accès. */
export type KioskError = "KIOSK_NOT_FOUND" | "KIOSK_LABEL_TAKEN";
/** Refus d'emballage traduits (#8). */
export type PackError = "UNIT_ALREADY_PACKED" | "UNIT_PACK_CONFLICT";
/** Refus métier des livraisons (#9). */
export type DeliveryError = "DELIVERY_NOT_FOUND";
/** S.N. déjà pris pour ce projet et cette référence (contrainte unique, #7). */
export type BatchError = "SERIAL_TAKEN";
/** Refus du poste Test (#21) : motif manquant, étape de reprise hors gamme. */
export type TestError = "NC_REQUIRED" | "REWORK_TARGET_INVALID";
/** Photo de défaut (#23) : stockage non configuré, fichier absent, chemin hors unité, lecture refusée. */
export type PhotoError = "PHOTO_UNAVAILABLE" | "PHOTO_NOT_FOUND" | "PHOTO_PATH_INVALID" | "PHOTO_FORBIDDEN";
export type ErrorCode = AccessError | KioskError | PackError | DeliveryError | BatchError | TestError | PhotoError | "GENERIC";

const TRANSLATED: readonly string[] = [
  "AUTH_REQUIRED", "FORBIDDEN", "KIOSK_REVOKED", "KIOSK_NOT_FOUND", "KIOSK_LABEL_TAKEN",
  "UNIT_ALREADY_PACKED", "UNIT_PACK_CONFLICT",
  "DELIVERY_NOT_FOUND",
  "SERIAL_TAKEN",
  "NC_REQUIRED", "REWORK_TARGET_INVALID",
  "PHOTO_UNAVAILABLE", "PHOTO_NOT_FOUND", "PHOTO_PATH_INVALID", "PHOTO_FORBIDDEN",
] satisfies Array<Exclude<ErrorCode, "GENERIC">>;

/** Texte affiché pour l'erreur d'une action : code traduit, sinon message métier tel quel (D4). */
export function errorMessage(error: string | undefined, t: Dict): string {
  if (error && TRANSLATED.includes(error)) return t.errors[error as Exclude<ErrorCode, "GENERIC">];
  if (!error || error === "GENERIC") return t.errors.generic;
  return error;
}

/**
 * Signale l'échec d'une action lancée sans l'attendre (ex. `markPrintedAction` après
 * impression) : sans cela, l'échec était silencieux (QA #3, R4).
 */
export function reportFailure(
  call: Promise<{ ok: boolean; error?: string }>,
  t: Dict,
  notify: (message: string) => void,
): Promise<void> {
  return call.then(
    (res) => {
      if (!res.ok) notify(errorMessage(res.error, t));
    },
    () => notify(t.errors.network),
  );
}
