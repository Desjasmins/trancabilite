// Écran d'aide affiché tant que la base de données n'est pas connectée.
export function DbSetupNotice({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center gap-3">
        <span className="brand-mark" />
        <span className="text-lg font-bold tracking-[0.12em]">LIGHTBASE</span>
      </div>
      <h1 className="text-2xl font-bold">Base de données non connectée</h1>
      <p className="text-muted-foreground">
        L&apos;application est prête, mais aucune base PostgreSQL n&apos;est encore
        accessible. Configurez la connexion puis rechargez la page.
      </p>
      <ol className="list-decimal space-y-3 rounded-xl border border-line bg-panel p-5 text-sm">
        <li>
          Renseignez <code className="font-mono text-amber">DATABASE_URL</code> dans le
          fichier <code className="font-mono">.env</code>.
        </li>
        <li>
          Appliquez le schéma :{" "}
          <code className="font-mono text-amber">pnpm db:push</code>
        </li>
        <li>
          Chargez les données de démo :{" "}
          <code className="font-mono text-amber">pnpm db:seed</code>
        </li>
      </ol>
      <details className="text-xs text-faint">
        <summary className="cursor-pointer">Détail de l&apos;erreur</summary>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-panel2 p-3">
          {message}
        </pre>
      </details>
    </main>
  );
}
