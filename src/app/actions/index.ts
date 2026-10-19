// Point d'entrée unique de `@/app/actions` : les composants importent d'ici.
// Pas de "use server" : ce fichier ne fait que réexporter ; chaque module
// source porte la directive, ce qui fait de ses exports des Server Functions.
export type { ActionResult } from "./_shared";
export { createBatchAction, updateBatchAction, markPrintedAction } from "./batches";
export {
  confirmMontageAction,
  confirmMontageBulkAction,
  retestUnitAction,
  retestUnitOfficeAction,
  confirmTestAction,
  confirmVerifAction,
  packUnitAction,
} from "./floor";
export { createDeliveryAction, closeDeliveryAction } from "./deliveries";
export { saveSettingsAction, saveTemplateAction } from "./settings";
export { getLiveDataAction } from "./live";
export { pairKioskAction, revokeKioskAction, renameKioskAction, listKiosksAction } from "./kiosks";
