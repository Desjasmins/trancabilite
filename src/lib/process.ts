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
