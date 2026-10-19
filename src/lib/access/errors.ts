import type { Dict } from "@/lib/i18n";

/**
 * Codes d'erreur renvoyés par les Server Actions (#3) et traduits côté client.
 * Sans "server-only" : `run()` et l'éditeur de gabarit (client) les lisent.
 */
export type AccessError = "AUTH_REQUIRED" | "FORBIDDEN";
export type ErrorCode = AccessError | "GENERIC";

/** Texte affiché pour l'erreur d'une action : code traduit, sinon message métier tel quel (D4). */
export function errorMessage(error: string | undefined, t: Dict): string {
  if (error === "AUTH_REQUIRED" || error === "FORBIDDEN") return t.errors[error];
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
