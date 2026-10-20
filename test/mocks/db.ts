import { vi, type Mock } from "vitest";

/**
 * Bouchon de `@/lib/db` — aucune vraie base (GUARDRAILS §12).
 * Usage : `vi.mock("@/lib/db", () => import("../../test/mocks/db"))` (chemin relatif au test).
 */
function model() {
  return {
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
  };
}

type Model = ReturnType<typeof model>;
export type PrismaMock = Record<string, Model> & {
  $transaction: Mock<(arg: unknown) => Promise<unknown>>;
};

const models: Record<string, Model> = {};
// Délégués = les 15 modèles de prisma/schema.prisma (vérifié contre Prisma.ModelName dans mocks.test.ts).
export const MODEL_DELEGATES = [
  "operation", "route", "routeStep", "operator", "batch", "delivery", "unit",
  "traceEvent", "settings", "labelTemplate", "user", "session", "account", "verification",
  "kiosk",
] as const;
for (const name of MODEL_DELEGATES) {
  models[name] = model();
}

export const prisma = { ...models } as PrismaMock;

// `$transaction` sous ses deux formes Prisma : callback interactif (reçoit le client) OU tableau.
prisma.$transaction = vi.fn(async (arg: unknown): Promise<unknown> => {
  if (typeof arg === "function") return (arg as (tx: PrismaMock) => unknown)(prisma);
  if (Array.isArray(arg)) return Promise.all(arg);
  throw new TypeError("$transaction attend un callback ou un tableau");
});

/** Remet à zéro tous les bouchons (à appeler dans `beforeEach`). */
export function resetDbMock() {
  for (const m of Object.values(models)) for (const fn of Object.values(m)) fn.mockReset();
  prisma.$transaction.mockClear();
}
