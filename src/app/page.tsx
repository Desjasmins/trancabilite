import { loadSnapshot } from "@/lib/queries";
import { getActor } from "@/lib/access/actor";
import { projectSnapshot } from "@/lib/access/project";
import { AppProvider } from "@/components/app-context";
import { AppRoot } from "@/components/app-root";
import { DbSetupNotice } from "@/components/db-setup-notice";
import type { AuthUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let snapshot;
  let user: AuthUser | null = null;
  try {
    // Acteur résolu côté serveur (#3) : banni → aucun utilisateur, rôle inconnu → null.
    const [snap, actor] = await Promise.all([loadSnapshot(), getActor({ mode: "render" })]);
    snapshot = projectSnapshot(snap, actor);
    user = actor.user;
  } catch (e) {
    // Le message brut peut contenir l'URL de connexion : journal serveur seulement (NB9).
    console.error("[page] chargement impossible", e);
    return <DbSetupNotice />;
  }

  // R1 : la key change avec l'identité (connexion, déconnexion + router.refresh()). React
  // remonte alors AppProvider, dont l'état repart de l'instantané projeté pour cette
  // identité : rien de ce qu'un anonyme avait chargé (opérateurs, gabarit) ne survit.
  const identity = user ? `${user.id}:${user.role ?? "aucun"}` : "anonyme";

  return (
    <AppProvider key={identity} initial={snapshot} user={user}>
      <AppRoot />
    </AppProvider>
  );
}
