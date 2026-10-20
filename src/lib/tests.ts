// Essais du poste Test (#21) : essais propres au type (PAN 003 aujourd'hui pour tous),
// puis l'essai commun à tous les types, le contrôle visuel. Ordre = ordre d'affichage.

export const PAN003_TESTS = ["diel", "pol", "eff"] as const;
export const COMMON_TESTS = ["visual"] as const;

export type ElectricTest = (typeof PAN003_TESTS)[number];
export type TestKey = ElectricTest | (typeof COMMON_TESTS)[number];

export function testsFor(typeTests: readonly ElectricTest[] = PAN003_TESTS): TestKey[] {
  return [...typeTests, ...COMMON_TESTS];
}
