import type { UnitDTO, StatusKey, StationKey, DeliveryDTO } from "./types";
import { pad } from "./label";

/**
 * Statut dérivé d'une unité, à partir du cache d'état (currentOperationKey/blocked)
 * lui-même dérivé du journal d'événements. Route-aware : une unité dont la gamme
 * ne contient pas « test » ne s'arrête jamais au poste Test.
 */
export function statut(u: UnitDTO): StatusKey {
  if (u.blocked) return "rejet";
  if (u.currentOperationKey === null) {
    return u.livraison ? "livre" : "pret";
  }
  // En cours : le statut EST l'opération courante (montage/test/verification/…).
  return u.currentOperationKey as StatusKey;
}

/** File d'attente d'un poste. */
export function queueFor(units: UnitDTO[], st: StationKey): UnitDTO[] {
  const list =
    st === "emballage"
      ? units.filter((u) => !u.blocked && u.currentOperationKey === null && !u.livraison)
      : units.filter((u) => !u.blocked && u.currentOperationKey === st);
  return list.sort((a, b) => a.dateCreation.localeCompare(b.dateCreation));
}

/** Prochain numéro de série pour un couple projet/référence. */
export function nextSerial(
  units: UnitDTO[],
  projet: string,
  reference: string,
  start?: string | number | null,
): number {
  const same = units.filter((u) => u.projet === projet && u.reference === reference);
  let max = start ? parseInt(String(start), 10) - 1 : 0;
  same.forEach((u) => {
    const n = parseInt(u.serie, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

/** Prochain identifiant de livraison LIV-AAAA-NNN. */
export function nextDeliveryId(deliveries: DeliveryDTO[], year: number): string {
  let mx = 0;
  deliveries.forEach((d) => {
    const m = /LIV-(\d{4})-(\d+)/.exec(d.id || "");
    if (m && +m[1] === year) {
      const n = +m[2];
      if (n > mx) mx = n;
    }
  });
  return `LIV-${year}-${pad(mx + 1)}`;
}

export function byId(units: UnitDTO[], id: string) {
  return units.find((u) => u.id === id) || null;
}
