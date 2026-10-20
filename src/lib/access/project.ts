import { defaultTemplate } from "@/lib/label";
import type { LabelTemplate, SettingsDTO, UnitDTO } from "@/lib/types";
import type { Actor } from "./policy";

type Projectable = { settings?: SettingsDTO; template?: LabelTemplate; units?: UnitDTO[] };

/** Retire le libellé d'écran de chaque étape (#4) : le nom des écrans reste interne. */
function withoutScreens(u: UnitDTO): UnitDTO {
  return {
    ...u,
    montage: { ...u.montage, ecran: null },
    test: { ...u.test, ecran: null },
    verification: { ...u.verification, ecran: null },
  };
}

/**
 * Ce qu'un acteur peut lire (#3), seule source pour la page ET la synchro live.
 * Client sans écran : ni la liste des opérateurs, ni le gabarit enregistré (gabarit neutre à
 * la place, pour garder la forme attendue par l'écran), ni le nom des écrans d'atelier. Client sur un écran appairé : tout,
 * c'est l'écran qui est autorisé (NB-b, #4). Sinon : tout — l'acteur qui arrive ici a passé
 * la garde READ (écran, staff, ou acteur nul drapeau éteint, #5).
 */
export function projectSnapshot<T extends object>(data: T, actor: Actor): T {
  if (actor.user?.role !== "client" || actor.kiosk) return data;
  // `object` + lecture typée : un type aux champs tous optionnels refuserait ActionResult.
  const { settings, template, units } = data as Projectable;
  return {
    ...data,
    ...(units && { units: units.map(withoutScreens) }),
    ...(settings && { settings: { ...settings, ops: [] } }),
    ...(template && { template: defaultTemplate() }),
  };
}
