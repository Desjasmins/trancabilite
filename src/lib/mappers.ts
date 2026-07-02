import type { Unit, Batch, Delivery, TraceEvent, Operation, Route, RouteStep } from "@/generated/prisma/client";
import type { UnitDTO, BatchDTO, DeliveryDTO, TestResult, OperationDTO, RouteDTO } from "./types";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const tr = (v: unknown): TestResult =>
  v === "accept" || v === "refus" ? v : null;

type UnitWithEvents = Unit & { events: TraceEvent[] };

/** Dernier événement d'une opération donnée (le journal est append-only). */
function lastEvent(events: TraceEvent[], key: string): TraceEvent | undefined {
  let found: TraceEvent | undefined;
  for (const e of events) {
    if (e.operationKey === key) {
      if (!found || e.createdAt > found.createdAt) found = e;
    }
  }
  return found;
}

/** Reconstruit le DTO (forme historique) en repliant les événements. */
export function toUnitDTO(u: UnitWithEvents): UnitDTO {
  const events = u.events ?? [];
  const montage = lastEvent(events, "montage");
  const test = lastEvent(events, "test");
  const verification = lastEvent(events, "verification");
  const testData = (test?.data as { diel?: unknown; pol?: unknown; eff?: unknown } | null) ?? {};

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
    montage: { par: montage?.operator ?? null, date: iso(montage?.createdAt) },
    test: {
      par: test?.operator ?? null,
      date: iso(test?.createdAt),
      diel: tr(testData.diel),
      pol: tr(testData.pol),
      eff: tr(testData.eff),
    },
    verification: { par: verification?.operator ?? null, date: iso(verification?.createdAt) },
    nc: u.nc ?? "",
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
