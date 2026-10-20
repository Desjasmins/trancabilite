import type { Policy } from "@/lib/access/policy";

/**
 * Tableau UNIQUE nom d'action → politique (#3). Sans "use server" : ce n'est pas un
 * point d'entrée. Toute action exportée par `index.ts` y figure (test policies.test.ts) ;
 * `withAccess` refuse un nom absent.
 */
export const POLICIES = {
  // Écritures du Bureau : admin ou superviseur.
  updateBatchAction: "STAFF_WRITE",
  saveSettingsAction: "STAFF_WRITE",
  saveTemplateAction: "STAFF_WRITE",
  retestUnitOfficeAction: "STAFF_WRITE",
  // Atelier : ouvert temporairement, jusqu'à l'écran d'atelier identifié (#4).
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
