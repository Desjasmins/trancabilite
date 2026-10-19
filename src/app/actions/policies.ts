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
  // Atelier : ouvert temporairement, jusqu'à ce que le #5 exige l'écran (écran révoqué refusé dès le #4).
  createBatchAction: "OPEN_UNTIL_KIOSK",
  markPrintedAction: "OPEN_UNTIL_KIOSK",
  confirmMontageAction: "OPEN_UNTIL_KIOSK",
  confirmMontageBulkAction: "OPEN_UNTIL_KIOSK",
  retestUnitAction: "OPEN_UNTIL_KIOSK",
  confirmTestAction: "OPEN_UNTIL_KIOSK",
  confirmVerifAction: "OPEN_UNTIL_KIOSK",
  packUnitAction: "OPEN_UNTIL_KIOSK",
  createDeliveryAction: "OPEN_UNTIL_KIOSK",
  closeDeliveryAction: "OPEN_UNTIL_KIOSK",
  getLiveDataAction: "OPEN_UNTIL_KIOSK",
} as const satisfies Record<string, Policy>;

export type ActionName = keyof typeof POLICIES;
