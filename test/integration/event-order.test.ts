import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { assertLocalDatabase } from "../setup/assert-local-db";

/**
 * Intégration #19 — heure du journal lue côté base, sur un VRAI PostgreSQL jetable (jamais Supabase).
 *
 * Ne tourne que si TEST_PG_URL est fourni ; sinon ignoré (la suite courante reste sans base).
 *
 *   docker run -d --name lb-dev19-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=lb19 \
 *     -p 127.0.0.1:55419:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://postgres:pg@127.0.0.1:55419/lb19 pnpm exec prisma db push   # CETTE base locale uniquement
 *   TEST_PG_URL=postgresql://postgres:pg@127.0.0.1:55419/lb19 \
 *   DATABASE_URL=$TEST_PG_URL pnpm exec vitest run test/integration --no-file-parallelism  # les fichiers TRUNCATE la même base
 *   docker rm -f lb-dev19-pg
 */
const URL_ = process.env.TEST_PG_URL;

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

describe.skipIf(!URL_)("dbNow / compareEvents — Étant donné un vrai PostgreSQL local (#19)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let shared: typeof import("@/app/actions/_shared");
  let proc: typeof import("@/lib/process");

  beforeAll(async () => {
    assertLocalDatabase({ DATABASE_URL: URL_ }); // §12 : jamais une base distante
    if (process.env.DATABASE_URL !== URL_) throw new Error("DATABASE_URL doit égaler TEST_PG_URL");
    prisma = (await import("@/lib/db")).prisma;
    shared = await import("@/app/actions/_shared");
    proc = await import("@/lib/process");
    await prisma.$executeRaw`TRUNCATE units, batches CASCADE`;
    await prisma.operation.upsert({ where: { key: "test" }, update: {}, create: { key: "test", labelFr: "Test", labelEn: "Test" } });
  }, 60_000);
  afterAll(async () => { await prisma?.$disconnect(); });

  it("Quand on lit l'heure deux fois dans une transaction, alors clock_timestamp() avance (now() ne bouge pas)", async () => {
    const [t1, t2, n1, n2] = await prisma.$transaction(async (tx) => {
      const a = await shared.dbNow(tx);
      const [{ n: na }] = await tx.$queryRaw<{ n: Date }[]>`SELECT now() AS n`;
      await tx.$executeRaw`SELECT pg_sleep(0.01)`;
      const b = await shared.dbNow(tx);
      const [{ n: nb }] = await tx.$queryRaw<{ n: Date }[]>`SELECT now() AS n`;
      return [a, b, na, nb];
    });
    expect(t1).toBeInstanceOf(Date);
    expect(t2.getTime()).toBeGreaterThan(t1.getTime());
    expect(n2.getTime()).toBe(n1.getTime());
  });

  it("Quand fail et rework sont écrits à l'envers au même instant de base, alors le journal relu donne fail puis rework", async () => {
    const unit = await prisma.unit.create({ data: { serie: "001", projet: "P19", reference: "R19", currentOperationKey: "test" } });
    await prisma.$transaction(async (tx) => {
      const { failAt, reworkAt } = shared.pairTimestamps(await shared.dbNow(tx));
      expect(reworkAt.getTime() - failAt.getTime()).toBe(1);
      // Pire cas : ordre d'insertion inverse et même createdAt ; seul le rang tranche.
      await tx.traceEvent.create({ data: { unitId: unit.id, operationKey: "test", result: "rework", operator: "Ana", createdAt: failAt, data: { to: "montage" } } });
      await tx.traceEvent.create({ data: { unitId: unit.id, operationKey: "test", result: "fail", operator: "Ana", createdAt: failAt } });
    });
    const events = await prisma.traceEvent.findMany({ where: { unitId: unit.id }, orderBy: proc.EVENT_ORDER });
    expect([...events].sort(proc.compareEvents).map((e) => e.result)).toEqual(["fail", "rework"]);
    expect(proc.deriveCurrentStep(["montage", "test", "verification"], events)).toBe("montage");
  });
});
