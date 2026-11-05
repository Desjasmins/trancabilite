// Règles de la photo de défaut (#23), partagées par l'écran et le serveur. Aucun secret ici.

/** Formats acceptés : extension du chemin ↔ type MIME du fichier. */
export const PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
} as const;
export type PhotoExt = (typeof PHOTO_TYPES)[keyof typeof PHOTO_TYPES];
export const PHOTO_EXTS = Object.values(PHOTO_TYPES) as PhotoExt[];

/** Limite posée aussi sur le bucket `nc-photos`. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Durée de l'URL de lecture signée (TDD B5) : 10 min. */
export const PHOTO_URL_TTL_S = 600;

/** Contrôle côté écran avant l'envoi ; le bucket refait le même contrôle. */
export function checkPhotoFile(file: { type: string; size: number }): "ok" | "type" | "size" {
  if (!Object.hasOwn(PHOTO_TYPES, file.type)) return "type";
  if (file.size > PHOTO_MAX_BYTES) return "size";
  return "ok";
}

export function photoExtOf(type: string): PhotoExt | null {
  return Object.hasOwn(PHOTO_TYPES, type) ? PHOTO_TYPES[type as keyof typeof PHOTO_TYPES] : null;
}

const SEGMENT = /^[\w-]+$/;
const NAME = new RegExp(`^[\\w-]+\\.(${PHOTO_EXTS.join("|")})$`);

/** Le chemin appartient-il à l'unité ? Préfixe imposé `units/{unitId}/` (revue de design, d). */
export function isPhotoPathFor(unitId: string, path: string): boolean {
  if (!SEGMENT.test(unitId)) return false;
  const prefix = `units/${unitId}/`;
  return path.startsWith(prefix) && NAME.test(path.slice(prefix.length));
}

/**
 * Envoi direct du fichier vers l'URL signée (navigateur → bucket), sans clé : le jeton est
 * dans l'URL. Corps binaire brut, comme `uploadToSignedUrl` de storage-js hors FormData.
 * Ne lève jamais : false si le réseau ou le bucket refuse.
 */
export async function putPhoto(url: string, file: Blob): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "content-type": file.type, "cache-control": "max-age=3600", "x-upsert": "false" },
      body: file,
    });
    if (!res.ok) console.warn("[putPhoto]", res.status);
    return res.ok;
  } catch (e) {
    console.warn("[putPhoto]", e);
    return false;
  }
}
