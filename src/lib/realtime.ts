"use client";

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";

// Synchro temps réel des écrans via Supabase Realtime (canal "broadcast").
// Le serveur reste la source de vérité : on n'envoie qu'un SIGNAL « ça a changé ».
// Sans variables d'env, tout est no-op (l'app marche, sans synchro live).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CHANNEL = "lb-sync";

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();

export function realtimeEnabled() {
  return Boolean(url && anon);
}

function ensureChannel(): RealtimeChannel | null {
  if (!url || !anon) return null;
  if (!client) {
    client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  if (!channel) {
    channel = client.channel(CHANNEL, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "changed" }, () => {
        listeners.forEach((l) => l());
      })
      .subscribe();
  }
  return channel;
}

/** S'abonne aux changements distants. Retourne une fonction de désinscription. */
export function subscribeSync(onChange: () => void): () => void {
  if (!realtimeEnabled()) return () => {};
  ensureChannel();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Notifie les autres écrans qu'une donnée a changé. */
export function notifyChange() {
  const ch = ensureChannel();
  if (!ch) return;
  void ch.send({ type: "broadcast", event: "changed", payload: {} });
}
