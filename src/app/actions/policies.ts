import type { Policy } from "@/lib/access/policy";

/**
 * Tableau UNIQUE nom d'action → politique (#3). Sans "use server" : ce n'est pas un
 * point d'entrée. Toute action exportée par `index.ts` y figure (test policies.test.ts) ;
 * `withAccess` refuse un nom absent.
 */
export const POLICIES = {
  // Écrans d'atelier (#4) : admin seulement (la liste aussi : elle sert à les révoquer).
  pairKioskAction: "ADMIN_WRITE",
  revokeKioskAction: "ADMIN_WRITE",
  renameKioskAction: "ADMIN_WRITE",
  listKiosksAction: "ADMIN_WRITE",
  // Écritures du Bureau : admin ou superviseur.
  updateBatchAction: "STAFF_WRITE",
  saveSettingsAction: "STAFF_WRITE",
  saveTemplateAction: "STAFF_WRITE",
  retestUnitOfficeAction: "STAFF_WRITE",
  // Photo de défaut (#23, B5) : lecture staff seulement ; le handler refuse aussi le client sur écran.
  getDefectPhotoUrlAction: "STAFF_WRITE",
  // Atelier (#5) : écran appairé ou admin/superviseur. Le poste Étiquettes crée les lots (NB8, tranché).
  createBatchAction: "FLOOR_WRITE",
  markPrintedAction: "FLOOR_WRITE",
  confirmMontageAction: "FLOOR_WRITE",
  confirmMontageBulkAction: "FLOOR_WRITE",
  retestUnitAction: "FLOOR_WRITE",
  confirmTestAction: "FLOOR_WRITE",
  // Photo de défaut (#23) : envoi depuis le poste Test (décision de Gedeon).
  createDefectPhotoUploadAction: "FLOOR_WRITE",
  confirmVerifAction: "FLOOR_WRITE",
  packUnitAction: "FLOOR_WRITE",
  createDeliveryAction: "FLOOR_WRITE",
  closeDeliveryAction: "FLOOR_WRITE",
  // Lecture : écran appairé ou tout compte de rôle connu. (getUnitEventsAction n'existe pas.)
  getLiveDataAction: "READ",
} as const satisfies Record<string, Policy>;

export type ActionName = keyof typeof POLICIES;
