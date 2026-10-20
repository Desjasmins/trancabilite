/**
 * Garde-fou GUARDRAILS §12 : aucun test ne vise une vraie base.
 * Logique pure, appelée par test/setup/guard-db.ts (setupFiles de vitest.config.mts).
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** Lève si une des URL de base est définie et vise un hôte non local. */
export function assertLocalDatabase(env: Record<string, string | undefined>): void {
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const raw = env[key];
    if (!raw) continue;
    let host: string;
    try {
      host = new URL(raw).hostname;
    } catch {
      throw new Error(`${key} illisible : les tests refusent de tourner (GUARDRAILS §12).`);
    }
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(`${key} vise « ${host} » : les tests ne joignent jamais une base distante (GUARDRAILS §12).`);
    }
  }
}

