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

/** Clé de l'opération qui porte l'essai (poste Test). */
export const TEST_OP = "test";

/** Vrai si la gamme n'a pas de poste Test : ses unités ne passeront pas le contrôle visuel (#20). */
export function routeLacksTest(steps: string[]): boolean {
  return !steps.includes(TEST_OP);
}
