"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLiveDataAction, type ActionResult } from "@/app/actions";
import { subscribeSync, realtimeEnabled } from "@/lib/realtime";

const STOP_ON: readonly string[] = ["AUTH_REQUIRED", "KIOSK_REVOKED", "FORBIDDEN"];

/**
 * Synchro live (extrait d'AppProvider, #5) : signal temps réel + filets de sécurité pour
 * qu'aucun écran ne reste périmé sans action de l'utilisateur. `live` à false : rien.
 */
export function useLiveSync(live: boolean, applyResult: (res: ActionResult) => void) {
  const router = useRouter();
  useEffect(() => {
    if (!live) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const refresh = () => {
      void getLiveDataAction().then((res) => {
        if (res.ok) applyResult(res);
        // #5 : l'accès est retiré (session, écran révoqué, droits) → plus de sondage ; le rendu
        // serveur décide de la suite (porte de connexion, état de l'écran).
        else if (!stopped && STOP_ON.includes(res.error ?? "")) {
          stop();
          router.refresh();
        }
      });
    };
    // Groupe les signaux rapprochés (plusieurs actions en rafale -> 1 rechargement).
    const onSignal = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refresh, 200);
    };

    // 1) Temps réel : un autre écran a changé une donnée.
    const unsub = subscribeSync(onSignal);

    // 2) Onglet redevenu visible (veille, changement d'onglet) : des signaux
    //    ont pu être ratés pendant ce temps.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    // 3) Retour du réseau.
    window.addEventListener("online", refresh);

    // 4) Rafraîchissement périodique de secours (onglet visible seulement) :
    //    garantit la fraîcheur même si le temps réel est indisponible.
    const every = realtimeEnabled() ? 60_000 : 20_000;
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, every);

    function stop() {
      stopped = true;
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
    }
    return stop;
  }, [applyResult, live, router]);
}
