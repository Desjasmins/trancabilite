import { vi } from "vitest";

/**
 * Bouchon de `@/lib/queries` pour les tests de figement des actions (#2).
 * Chaque chargeur rend une sentinelle : on vérifie que l'action renvoie bien CE chargement.
 */
export const loadUnits = vi.fn();
export const loadBatches = vi.fn();
export const loadDeliveries = vi.fn();
export const loadSettings = vi.fn();
export const loadTemplate = vi.fn();

export const UNITS = [{ id: "sentinelle-unites" }];
export const BATCHES = [{ id: "sentinelle-lots" }];
export const DELIVERIES = [{ id: "sentinelle-livraisons" }];
export const SETTINGS = { sub: "sentinelle-reglages" };
export const TEMPLATE = { presetId: "sentinelle-gabarit" };

/** Remet les chargeurs à leurs sentinelles (à appeler dans `beforeEach`). */
export function resetQueriesMock() {
  loadUnits.mockReset().mockResolvedValue(UNITS);
  loadBatches.mockReset().mockResolvedValue(BATCHES);
  loadDeliveries.mockReset().mockResolvedValue(DELIVERIES);
  loadSettings.mockReset().mockResolvedValue(SETTINGS);
  loadTemplate.mockReset().mockResolvedValue(TEMPLATE);
}
