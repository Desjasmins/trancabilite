import type { Unit, Delivery } from "@/generated/prisma/client";
import type { UnitDTO, DeliveryDTO, TestResult } from "./types";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const tr = (v: string | null | undefined): TestResult =>
  v === "accept" || v === "refus" ? v : null;

export function toUnitDTO(u: Unit): UnitDTO {
  return {
    id: u.id,
    serie: u.serie,
    projet: u.projet,
    reference: u.reference,
    po: u.po ?? "",
    dessin: u.dessin ?? "",
    sub: u.sub ?? "",
    batchId: u.batchId ?? "",
    livraison: u.deliveryId ?? "",
    dateCreation: u.dateCreation.toISOString(),
    etiquette: {
      par: u.etiquettePar ?? null,
      date: iso(u.etiquetteDate),
      imprimee: u.etiquetteImprimee,
    },
    montage: { par: u.montagePar ?? null, date: iso(u.montageDate) },
    test: {
      par: u.testPar ?? null,
      date: iso(u.testDate),
      diel: tr(u.testDiel),
      pol: tr(u.testPol),
      eff: tr(u.testEff),
    },
    verification: { par: u.verificationPar ?? null, date: iso(u.verificationDate) },
    nc: u.nc ?? "",
  };
}

export function toDeliveryDTO(d: Delivery): DeliveryDTO {
  return {
    id: d.id,
    client: d.client ?? "",
    date: d.date.toISOString(),
    closed: d.closed,
  };
}
