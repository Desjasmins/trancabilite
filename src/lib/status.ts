import type { UnitDTO, StatusKey, StationKey, DeliveryDTO } from "./types";
import { pad } from "./label";

/** Statut dérivé d'une unité (machine à états du flux de production). */
export function statut(u: UnitDTO): StatusKey {
  const r = [u.test.diel, u.test.pol, u.test.eff];
  if (r.includes("refus")) return "rejet";
  if (u.livraison && u.verification.par) return "livre";
  if (u.verification.par) return "pret";
  if (u.test.par && r.every((x) => x === "accept")) return "verification";
  if (u.montage.par) return "test";
  return "montage";
}

const STATION_TO_STATUS: Record<string, StatusKey> = {
  montage: "montage",
  test: "test",
  verification: "verification",
  emballage: "pret",
};

/** File d'attente d'un poste, triée par date de création. */
export function queueFor(units: UnitDTO[], st: StationKey): UnitDTO[] {
  const target = STATION_TO_STATUS[st];
  return units
    .filter((u) => statut(u) === target)
    .sort((a, b) => a.dateCreation.localeCompare(b.dateCreation));
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
