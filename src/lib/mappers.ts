import type { Unit, Batch, Delivery, TraceEvent, Operation, Route, RouteStep, Kiosk } from "@/generated/prisma/client";
import { compareEvents, pendingRework } from "./process";
import type { UnitDTO, BatchDTO, DeliveryDTO, TestResult, OperationDTO, RouteDTO, KioskDTO } from "./types";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const tr = (v: unknown): TestResult =>
  v === "accept" || v === "refus" ? v : null;

/** Un renvoi vers une étape antérieure (#21) porte `data.to` ; un retest hérité (`rework` sans cible) n'en est pas un. */
const isSendBack = (e: TraceEvent) => {
  const to = (e.data as { to?: unknown } | null)?.to;
  return e.result === "rework" && typeof to === "string" && to !== "";
};

type UnitWithEvents = Unit & { events: TraceEvent[] };

/**
 * Dernier événement d'une opération donnée, selon l'ordre total `compareEvents` (#19),
 * limité aux résultats `results` (#21, B2) : un `rework` n'efface jamais l'essai réel.
 */
function lastEvent(sorted: readonly TraceEvent[], key: string, results: readonly string[]): TraceEvent | undefined {
  return sorted.findLast((e) => e.operationKey === key && results.includes(e.result));
}

/**
 * Reconstruit le DTO (forme historique) en repliant les événements. `kioskLabels` (id → libellé
 * courant) donne l'écran de chaque étape (#4) ; un id absent → null (écran non identifié).
 */
export function toUnitDTO(u: UnitWithEvents, kioskLabels: ReadonlyMap<string, string> = new Map()): UnitDTO {
  const events = [...(u.events ?? [])].sort(compareEvents);
  const montage = lastEvent(events, "montage", ["done"]);
  const test = lastEvent(events, "test", ["pass", "fail"]);
  const verification = lastEvent(events, "verification", ["done"]);
  const reprise = pendingRework(events);
  const ecran = (e: TraceEvent | undefined) => (e?.stationId && kioskLabels.get(e.stationId)) || null;
  const testData = (test?.data as { diel?: unknown; pol?: unknown; eff?: unknown; visual?: unknown } | null) ?? {};

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
    montage: { par: montage?.operator ?? null, date: iso(montage?.createdAt), ecran: ecran(montage) },
    test: {
      par: test?.operator ?? null,
      date: iso(test?.createdAt),
      ecran: ecran(test),
      diel: tr(testData.diel),
      pol: tr(testData.pol),
      eff: tr(testData.eff),
      visual: tr(testData.visual),
    },
    verification: { par: verification?.operator ?? null, date: iso(verification?.createdAt), ecran: ecran(verification) },
    nc: u.nc ?? "",
    reprise: reprise ? { note: reprise.note, at: reprise.at.toISOString() } : null,
    reprises: events.filter(isSendBack).length,
    currentOperationKey: u.currentOperationKey ?? null,
    blocked: u.blocked,
    version: u.version,
  };
}

export function toBatchDTO(b: Batch): BatchDTO {
  return {
    id: b.id,
    po: b.po ?? "",
    projet: b.projet,
    reference: b.reference,
    sub: b.sub ?? "",
    routeId: b.routeId ?? "",
    createdBy: b.createdBy ?? "",
    createdAt: b.createdAt.toISOString(),
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

export function toOperationDTO(o: Operation): OperationDTO {
  return { key: o.key, labelFr: o.labelFr, labelEn: o.labelEn, kind: o.kind };
}

export function toRouteDTO(r: Route & { steps: RouteStep[] }): RouteDTO {
  return {
    id: r.id,
    name: r.name,
    isDefault: r.isDefault,
    steps: [...r.steps].sort((a, b) => a.position - b.position).map((s) => s.operationKey),
  };
}

export function toKioskDTO(k: Kiosk): KioskDTO {
  return {
    id: k.id,
    label: k.label,
    createdAt: k.createdAt.toISOString(),
    lastSeenAt: iso(k.lastSeenAt),
    revokedAt: iso(k.revokedAt),
  };
}
