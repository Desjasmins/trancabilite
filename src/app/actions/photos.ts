"use server";

import { withAccess } from "@/lib/access/with-access";
import type { ActionResult } from "./_shared";
import { createDefectPhotoUpload, getDefectPhotoUrl } from "./_photos";

// Points d'entrée photo (#23) : politique lue dans POLICIES (envoi FLOOR_WRITE, lecture STAFF_WRITE).
const uploadGuarded = withAccess("createDefectPhotoUploadAction", createDefectPhotoUpload);
export async function createDefectPhotoUploadAction(input: unknown): Promise<ActionResult> {
  return uploadGuarded(input);
}
const urlGuarded = withAccess("getDefectPhotoUrlAction", getDefectPhotoUrl);
export async function getDefectPhotoUrlAction(input: unknown): Promise<ActionResult> {
  return urlGuarded(input);
}
