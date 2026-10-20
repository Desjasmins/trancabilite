"use client";

import { useLang } from "./lang-provider";

// Écran d'aide affiché tant que la base de données n'est pas connectée.
// Aucun détail d'exception ici : il peut contenir l'URL de connexion (NB9, #3).
export function DbSetupNotice() {
  const { t } = useLang();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center gap-3">
        <span className="brand-mark" />
        <span className="text-lg font-bold tracking-[0.12em]">LIGHTBASE</span>
      </div>
      <h1 className="text-2xl font-bold">{t.dbTitle}</h1>
      <p className="text-muted-foreground">{t.dbLead}</p>
      <ol className="list-decimal space-y-3 rounded-xl border border-line bg-panel p-5 text-sm">
        <li>
          {t.dbStepEnvA} <code className="font-mono text-amber">DATABASE_URL</code> {t.dbStepEnvB}{" "}
          <code className="font-mono">.env</code>.
        </li>
        <li>
          {t.dbStepPush}{" "}
          <code className="font-mono text-amber">pnpm db:push</code>
        </li>
        <li>
          {t.dbStepSeed}{" "}
          <code className="font-mono text-amber">pnpm db:seed</code>
        </li>
      </ol>
      <p className="text-xs text-faint">{t.dbServerLog}</p>
    </main>
  );
}
