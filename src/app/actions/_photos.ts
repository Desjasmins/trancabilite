import "server-only";

// Handlers des actions photo (#23). Sans "use server" : ce module n'est pas un point d'entrée
// (comme _shared.ts) ; photos.ts les expose sous withAccess. Exportés pour tester la défense
// en profondeur du handler, inatteignable à travers STAFF_WRITE.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { photoUploadSchema, photoUrlSchema } from "@/lib/schemas";
import { PHOTO_TYPES, PHOTO_URL_TTL_S, isPhotoPathFor } from "@/lib/photo";
import { photoStorage } from "@/lib/storage";
import type { Actor } from "@/lib/access/policy";
import { fail, failInvalid, type ActionResult } from "./_shared";

/**
 * URL de téléversement d'une photo de défaut (#23), FLOOR_WRITE. Le serveur impose le
 * chemin `units/{unitId}/{uuid}.{ext}` ; le fichier part ensuite directement du navigateur
 * vers le bucket privé (jamais par une Server Action, limitée à 1 Mo).
 */
export async function createDefectPhotoUpload(input: unknown): Promise<ActionResult> {
  const parsed = photoUploadSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { unitId, type } = parsed.data;
  const storage = photoStorage();
  if (!storage) return fail("PHOTO_UNAVAILABLE");
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true } });
  if (!unit) return fail("Unité introuvable");
  const path = `units/${unitId}/${randomUUID()}.${PHOTO_TYPES[type]}`;
  // Défense en profondeur : un unitId hors motif ne produit jamais de chemin signé.
  if (!isPhotoPathFor(unitId, path)) return fail("PHOTO_PATH_INVALID");
  return { ok: true, upload: { path, url: await storage.signUpload(path) } };
}

/**
 * URL de lecture signée (10 min) d'une photo de défaut (#23, TDD B5), STAFF_WRITE.
 * Après withAccess : refus du client même sur écran appairé ; l'événement doit appartenir à
 * l'unité, porter une photo, et ce chemin avoir le préfixe de l'unité.
 */
export async function getDefectPhotoUrl(input: unknown, actor: Actor): Promise<ActionResult> {
  if (!actor.user || actor.user.role === "client") return fail("PHOTO_FORBIDDEN");
  const parsed = photoUrlSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { unitId, eventId } = parsed.data;
  const event = await prisma.traceEvent.findUnique({ where: { id: eventId }, select: { unitId: true, data: true } });
  const photo = (event?.data as { photo?: unknown } | null)?.photo;
  if (!event || event.unitId !== unitId || typeof photo !== "string" || !isPhotoPathFor(unitId, photo))
    return fail("PHOTO_NOT_FOUND");
  const storage = photoStorage();
  if (!storage) return fail("PHOTO_UNAVAILABLE");
  return { ok: true, photoUrl: await storage.signRead(photo, PHOTO_URL_TTL_S) };
}
