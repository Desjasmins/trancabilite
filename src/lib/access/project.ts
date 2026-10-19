import { defaultTemplate } from "@/lib/label";
import type { LabelTemplate, SettingsDTO } from "@/lib/types";
import type { Actor } from "./policy";

type Projectable = { settings?: SettingsDTO; template?: LabelTemplate };

/**
 * Ce qu'un acteur peut lire (#3), seule source pour la page ET la synchro live.
 * Client sans écran : ni la liste des opérateurs ni le gabarit enregistré (gabarit neutre à
 * la place, pour garder la forme attendue par l'écran). Client sur un écran appairé : tout,
 * c'est l'écran qui est autorisé (NB-b, #4). Sinon : tout — l'anonyme reste traité comme
 * le kiosque d'atelier jusqu'au #5.
 */
export function projectSnapshot<T extends object>(data: T, actor: Actor): T {
  if (actor.user?.role !== "client" || actor.kiosk) return data;
  // `object` + lecture typée : un type aux champs tous optionnels refuserait ActionResult.
  const { settings, template } = data as Projectable;
  return {
    ...data,
    ...(settings && { settings: { ...settings, ops: [] } }),
    ...(template && { template: defaultTemplate() }),
  };
}
