// setupFiles (vitest.config.mts) : exécuté avant chaque fichier de test — GUARDRAILS §12.
import { assertLocalDatabase } from "./assert-local-db";

assertLocalDatabase(process.env);
