import { loadSnapshot } from "@/lib/queries";
import { getActor } from "@/lib/access/actor";
import { projectSnapshot } from "@/lib/access/project";
import { allowed } from "@/lib/access/policy";
import { floorEnforced } from "@/lib/access/flag";
import { defaultTemplate } from "@/lib/label";
import { AppProvider } from "@/components/app-context";
import { AppRoot } from "@/components/app-root";
import { DbSetupNotice } from "@/components/db-setup-notice";
import { UnregisteredGate } from "@/components/kiosk-panel";
import type { AuthUser, ScreenState, Snapshot } from "@/lib/types";

/** Instantané vide de la porte sans identité (#5) : la forme attendue, aucune donnée. */
const EMPTY: Snapshot = {
  units: [], batches: [], deliveries: [], operations: [], routes: [],
  settings: { sub: "", proj: "", ops: [] }, template: defaultTemplate(),
};

/** Page d'accueil (extraite de page.tsx, #5) : acteur, garde READ, instantané projeté. */
export default async function Home() {
  let snapshot: Snapshot | null = null;
  let user: AuthUser | null = null;
  let screen: ScreenState = { status: "none" };
  let floorGuardOff = false;
  let signedIn = false;
  try {
    // Acteur résolu côté serveur (#3) : banni → aucun utilisateur, rôle inconnu → null.
    const actor = await getActor({ mode: "render" });
    user = actor.user;
    // Une session existe (même bannie ou de rôle inconnu) : la porte propose de se déconnecter.
    signedIn = actor.user !== null || actor.banned;
    // État de l'écran (#4), lu au rendu sans rien écrire (mode "render").
    if (actor.kiosk) screen = { status: "paired", label: actor.kiosk.label };
    else if (actor.kioskRevoked) screen = { status: "revoked" };
    // #5 : READ avant toute lecture des données. Drapeau lu au rendu (page dynamique).
    const enforce = floorEnforced();
    floorGuardOff = !enforce && user?.role === "admin";
    if (allowed("READ", actor, enforce)) snapshot = projectSnapshot(await loadSnapshot(), actor);
  } catch (e) {
    // Le message brut peut contenir l'URL de connexion : journal serveur seulement (NB9).
    console.error("[page] chargement impossible", e);
    return <DbSetupNotice />;
  }

  // R1 : la key change avec l'identité (connexion, déconnexion + router.refresh()). React
  // remonte alors AppProvider, dont l'état repart de l'instantané projeté pour cette
  // identité : rien de ce qu'un anonyme avait chargé (opérateurs, gabarit) ne survit.
  // L'état de l'écran (#4) en fait partie : appairer ou révoquer repart aussi d'un état propre.
  const who = user ? `${user.id}:${user.role ?? "aucun"}` : "anonyme";
  const identity = `${who}:${screen.status}`;

  // #5 : sans identité autorisée, la porte (état de l'écran + connexion), sans synchro.
  if (!snapshot) {
    return (
      <AppProvider key={`porte:${identity}`} initial={EMPTY} user={null} live={false}>
        <UnregisteredGate screen={screen} signedIn={signedIn} />
      </AppProvider>
    );
  }

  return (
    <AppProvider key={identity} initial={snapshot} user={user} floorGuardOff={floorGuardOff}>
      <AppRoot screen={screen} />
    </AppProvider>
  );
}
