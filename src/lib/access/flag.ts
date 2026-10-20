import "server-only";

let warned = false;

/**
 * Drapeau de la garde de l'atelier (#5, TDD §12 B7). Variable serveur seulement : jamais
 * `NEXT_PUBLIC_*`, donc jamais inlinée dans le bundle client. Lue à chaque appel (rendu
 * dynamique, Server Action) : pas de constante figée au chargement du module.
 * Seule la valeur exacte "true" active la garde. Temporaire : échéance 2026-11-30.
 */
export function floorEnforced(): boolean {
  const on = process.env.ACCESS_ENFORCE_FLOOR === "true";
  if (!on && !warned) {
    warned = true;
    console.warn("[access] ACCESS_ENFORCE_FLOOR n'est pas \"true\" : l'atelier accepte encore les appels sans écran enregistré.");
  }
  return on;
}
