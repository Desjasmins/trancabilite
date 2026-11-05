import type { EventResult } from "@/generated/prisma/client";

// Helpers de gamme de fabrication (routage par donnée).
// Une gamme = liste ordonnée de clés d'opérations, ex. ["montage","test","verification"].

export function firstOp(steps: string[]): string | null {
  return steps[0] ?? null;
}

/** Opération suivante dans la gamme après `current`, ou null si dernière/absente. */
export function nextOp(steps: string[], current: string): string | null {
  const i = steps.indexOf(current);
  if (i < 0) return null;
  return steps[i + 1] ?? null;
}

export function isLastOp(steps: string[], current: string): boolean {
  return steps.indexOf(current) === steps.length - 1;
}

// ── Journal (#19) ────────────────────────────────────────────────────────────

/** Ce qu'il faut d'un événement du journal pour l'ordonner et rejouer la gamme. */
export interface JournalEvent {
  id: string;
  operationKey: string;
  result: string;
  createdAt: Date;
  data?: unknown;
}

/**
 * Rang de départage à `createdAt` égal : un renvoi écrit `fail` puis `rework` dans la
 * même transaction (TDD Rév. 3 §B1). Tout autre résultat (`pass`, `done`) vient après.
 */
// Exhaustif sur l'enum : un nouveau résultat ne compile pas tant qu'il n'est pas classé (revue #19).
const RANK: Readonly<Record<EventResult, number>> = { fail: 0, rework: 1, pass: 2, done: 2 };
const rank = (result: string) => RANK[result as EventResult] ?? 2;

/** Ordre de lecture SQL du journal ; l'ordre total reste `compareEvents` côté application. */
export const EVENT_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/** Ordre total du journal : `createdAt` croissant, puis rang du résultat, puis `id`. */
export function compareEvents(a: JournalEvent, b: JournalEvent): number {
  return (
    a.createdAt.getTime() - b.createdAt.getTime() ||
    rank(a.result) - rank(b.result) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Étape visée par un renvoi (`rework` avec `data.to`), sinon null (retest hérité). */
function reworkTarget(data: unknown): string | null {
  const to = (data as { to?: unknown } | null | undefined)?.to;
  return typeof to === "string" ? to : null;
}

/**
 * Étape courante dérivée du journal (TDD Rév. 3 §B4) : rejoue les événements dans l'ordre
 * de `compareEvents`. `done`/`pass` marque l'étape faite ; `fail` ne marque rien ; `rework`
 * sans `data.to` n'annule rien ; `rework` avec `data.to = X` annule les réussites des étapes
 * de position ≥ X dans `steps`. Rend la première étape non faite, ou null.
 */
export function deriveCurrentStep(steps: string[], events: readonly JournalEvent[]): string | null {
  const done = new Set<string>();
  for (const ev of [...events].sort(compareEvents)) {
    if (ev.result === "done" || ev.result === "pass") {
      done.add(ev.operationKey);
    } else if (ev.result === "rework") {
      const from = steps.indexOf(reworkTarget(ev.data) ?? "");
      if (from >= 0) for (const k of steps.slice(from)) done.delete(k);
    }
  }
  return steps.find((k) => !done.has(k)) ?? null;
}
