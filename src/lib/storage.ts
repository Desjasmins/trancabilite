import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Accès au bucket privé des photos de défaut (#23), côté serveur SEULEMENT : la clé de
 * service ne quitte jamais le serveur (jamais de `NEXT_PUBLIC_`). Seul point bouchonné
 * par les tests ; l'essai navigateur le pointe sur un faux stockage local.
 */
export interface PhotoStorage {
  /** URL de téléversement signée (jeton inclus) pour ce chemin exact, valable 2 h. */
  signUpload(path: string): Promise<string>;
  /** Le fichier existe-t-il dans le bucket ? */
  exists(path: string): Promise<boolean>;
  /** URL de lecture signée, valable `ttl` secondes. */
  signRead(path: string, ttl: number): Promise<string>;
}

/** null si la configuration manque : l'action répond PHOTO_UNAVAILABLE, l'app continue. */
export function photoStorage(): PhotoStorage | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const bucket = process.env.SUPABASE_PHOTO_BUCKET || "nc-photos";
  const files = createClient(url, key, { auth: { persistSession: false } }).storage.from(bucket);
  return {
    async signUpload(path) {
      const { data, error } = await files.createSignedUploadUrl(path);
      if (error) throw error;
      return data.signedUrl;
    },
    async exists(path) {
      // storage-js rend { data: false, error } pour 400/404 (absent) et LÈVE pour tout le reste.
      const { data } = await files.exists(path);
      return data;
    },
    async signRead(path, ttl) {
      const { data, error } = await files.createSignedUrl(path, ttl);
      if (error) throw error;
      return data.signedUrl;
    },
  };
}
