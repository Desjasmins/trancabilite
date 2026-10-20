import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { assertLocalDatabase } from "../setup/assert-local-db";

/**
 * Intégration #21 — renvoi au Montage par le contrôle visuel, sur un VRAI PostgreSQL jetable
 * (jamais Supabase). Ignoré sans TEST_PG_URL ; même mode d'emploi que event-order.test.ts :
 *
 *   docker run -d --name lb-dev21-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=lb21 \
 *     -p 127.0.0.1:55421:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://postgres:pg@127.0.0.1:55421/lb21 pnpm exec prisma db push   # CETTE base locale uniquement
 *   TEST_PG_URL=postgresql://postgres:pg@127.0.0.1:55421/lb21 \
 *   DATABASE_URL=$TEST_PG_URL pnpm exec vitest run test/integration --no-file-parallelism
 *   docker rm -f lb-dev21-pg
 */
const URL_ = process.env.TEST_PG_URL;

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

describe.skipIf(!URL_)("recordOperation({ reworkTo }) — Étant donné un vrai PostgreSQL local (#21)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let shared: typeof import("@/app/actions/_shared");
  let mappers: typeof import("@/lib/mappers");
  let proc: typeof import("@/lib/process");
  let routeId: string;

  beforeAll(async () => {
    assertLocalDatabase({ DATABASE_URL: URL_ }); // §12 : jamais une base distante
    if (process.env.DATABASE_URL !== URL_) throw new Error("DATABASE_URL doit égaler TEST_PG_URL");
    prisma = (await import("@/lib/db")).prisma;
    shared = await import("@/app/actions/_shared");
    mappers = await import("@/lib/mappers");
    proc = await import("@/lib/process");
    await prisma.$executeRaw`TRUNCATE units, batches, routes CASCADE`;
    for (const key of ["montage", "test", "verification"])
      await prisma.operation.upsert({ where: { key }, update: {}, create: { key, labelFr: key, labelEn: key } });
    const route = await prisma.route.create({ data: { name: "R21", steps: { create: [
      { operationKey: "montage", position: 1 }, { operationKey: "test", position: 2 }, { operationKey: "verification", position: 3 },
    ] } } });
    routeId = route.id;
  }, 60_000);
  afterAll(async () => { await prisma?.$disconnect(); });

  const newUnit = async (serie: string) => {
    const batch = await prisma.batch.create({ data: { projet: "P21", reference: "R21", routeId } });
    return prisma.unit.create({ data: { serie, projet: "P21", reference: "R21", batchId: batch.id, currentOperationKey: "test" } });
  };
  const visualFail = { operator: "Ana", result: "fail" as const, note: "rayure",
    data: { diel: "accept", pol: "accept", eff: "accept", visual: "refus" }, reworkTo: { step: "montage", cause: "visual" } };

  it("Quand le visuel est refusé, alors fail puis rework à 1 ms d'écart, unité au Montage non bloquée, reprise en attente ; puis Montage et essai complet", async () => {
    const u = await newUnit("001");
    await shared.recordOperation(u.id, "test", visualFail);
    const after = await prisma.unit.findUniqueOrThrow({ where: { id: u.id }, include: { events: { orderBy: proc.EVENT_ORDER } } });
    expect(after).toMatchObject({ currentOperationKey: "montage", blocked: false, nc: "rayure", version: 1 });
    const evs = [...after.events].sort(proc.compareEvents);
    expect(evs.map((e) => e.result)).toEqual(["fail", "rework"]);
    expect(evs[1].createdAt.getTime() - evs[0].createdAt.getTime()).toBe(1);
    expect(evs[1].data).toEqual({ to: "montage", cause: "visual" });
    const dto = mappers.toUnitDTO(after);
    expect(dto.reprise).toEqual({ note: "rayure", at: evs[1].createdAt.toISOString() });
    expect(dto.test).toMatchObject({ par: "Ana", visual: "refus" });
    expect(proc.deriveCurrentStep(["montage", "test", "verification"], after.events)).toBe("montage");

    await shared.recordOperation(u.id, "montage", { operator: "Max", result: "done" });
    await shared.recordOperation(u.id, "test", { operator: "Léo", result: "pass", data: { diel: "accept", pol: "accept", eff: "accept", visual: "accept" } });
    const done = await prisma.unit.findUniqueOrThrow({ where: { id: u.id }, include: { events: true } });
    expect(done).toMatchObject({ currentOperationKey: "verification", blocked: false, nc: null, version: 3 });
    expect(mappers.toUnitDTO(done).reprise).toBeNull();
    expect(mappers.toUnitDTO(done).test).toMatchObject({ par: "Léo", visual: "accept" });
  });

  it("Quand la version change pendant le renvoi, alors rollback : zéro événement écrit, unité inchangée", async () => {
    const u = await newUnit("002");
    // Un autre écran fait avancer la version après la lecture de recordOperation, avant son updateMany.
    const real = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce(((fn: (tx: never) => Promise<unknown>) =>
      real(async (tx) => {
        const orig = tx.unit.updateMany.bind(tx.unit);
        const unitProxy = new Proxy(tx.unit, {
          get: (t, k) => k === "updateMany"
            ? async (args: Parameters<typeof orig>[0]) => {
                await prisma.$executeRaw`UPDATE units SET version = version + 1 WHERE id = ${u.id}`;
                return orig(args);
              }
            : Reflect.get(t, k),
        });
        const txProxy = new Proxy(tx, { get: (t, k) => (k === "unit" ? unitProxy : Reflect.get(t, k)) });
        return fn(txProxy as never);
      })) as never);
    await expect(shared.recordOperation(u.id, "test", visualFail)).rejects.toThrow("Conflit de concurrence");
    spy.mockRestore();
    expect(await prisma.traceEvent.count({ where: { unitId: u.id } })).toBe(0);
    expect(await prisma.unit.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ currentOperationKey: "test", blocked: false, version: 1 });
  });
});
