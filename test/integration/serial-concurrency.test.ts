import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { assertLocalDatabase } from "../setup/assert-local-db";

/**
 * Intégration #7 — numérotation des S.N. sur un VRAI PostgreSQL jetable (jamais Supabase).
 *
 * Ne tourne que si TEST_PG_URL est fourni ; sinon ignoré (la suite courante reste sans base).
 * La garde §12 (test/setup/guard-db.ts) refuse déjà toute URL non locale.
 *
 *   docker run -d --name lb-dev7-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=lb7 \
 *     -p 127.0.0.1:55437:5432 postgres:16-alpine
 *   TEST_PG_URL=postgresql://postgres:pg@127.0.0.1:55437/lb7 \
 *   DATABASE_URL=$TEST_PG_URL pnpm exec vitest run test/integration
 *   docker rm -f lb-dev7-pg
 *
 * Préparation (CETTE base locale uniquement) : schéma de issue/5 (état de production) via
 * `prisma migrate diff --from-empty`, puis le script de détection des doublons, puis la
 * migration `prisma/migrations/*_unit_serial_unique` — voir README de la PR #7.
 */
const URL_ = process.env.TEST_PG_URL;

vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

describe.skipIf(!URL_)("createBatchAction — Étant donné un vrai PostgreSQL local (#7)", () => {
  type Mod = typeof import("@/app/actions");
  let actions: Mod;
  let prisma: typeof import("@/lib/db").prisma;

  beforeAll(async () => {
    assertLocalDatabase({ DATABASE_URL: URL_ }); // §12 : jamais une base distante
    // Prisma se connecte à DATABASE_URL : il doit viser la même base jetable (TRUNCATE plus bas).
    if (process.env.DATABASE_URL !== URL_) throw new Error("DATABASE_URL doit égaler TEST_PG_URL");
    const { setSession } = await import("../mocks/auth");
    const { PROFILES } = await import("../access/profiles");
    setSession(PROFILES.admin.session);
    actions = await import("@/app/actions");
    prisma = (await import("@/lib/db")).prisma;
    await prisma.$executeRaw`TRUNCATE units, batches CASCADE`;
  }, 60_000);
  afterAll(async () => { await prisma?.$disconnect(); });

  it("Quand deux lots sont créés en même temps, alors les S.N. sont tous distincts et consécutifs", async () => {
    const input = { projet: "PC", reference: "RC", qty: 20 };
    const [a, b] = await Promise.all([actions.createBatchAction(input), actions.createBatchAction(input)]);
    expect(a.ok && b.ok).toBe(true);
    const series = (await prisma.unit.findMany({ where: { projet: "PC", reference: "RC" } })).map((u) => u.serie);
    expect(new Set(series).size).toBe(40);
    expect(series.map(Number).sort((x, y) => x - y)).toEqual(Array.from({ length: 40 }, (_v, i) => i + 1));
  });

  it("Quand une création concurrente détient le verrou, alors createBatch attend son COMMIT et numérote après", async () => {
    let pending: ReturnType<Mod["createBatchAction"]> | undefined;
    // Transaction A joue une création concurrente déterministe : même verrou, S.N. « 001 »,
    // puis reste ouverte. Sans verrou, createBatch lirait une base vide et heurterait « 001 ».
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"PL"}::text || '|' || ${"RL"}::text))`;
      await tx.unit.create({ data: { serie: "001", projet: "PL", reference: "RL" } });
      pending = actions.createBatchAction({ projet: "PL", reference: "RL", qty: 2 });
      await new Promise((r) => setTimeout(r, 800));
    });
    expect((await pending)?.ok).toBe(true);
    const series = (await prisma.unit.findMany({ where: { projet: "PL" } })).map((u) => u.serie).sort();
    expect(series).toEqual(["001", "002", "003"]);
  });

  it("Quand un écrivain hors verrou prend le même S.N. (P2002), alors SERIAL_TAKEN et aucun lot orphelin", async () => {
    const before = await prisma.batch.count();
    let pending: ReturnType<Mod["createBatchAction"]> | undefined;
    // Transaction A : insère « 001 » sans le verrou et reste ouverte. createBatch ne voit pas
    // la ligne (non validée), calcule « 001 » et bloque sur l'index unique jusqu'au COMMIT de A.
    await prisma.$transaction(async (tx) => {
      await tx.unit.create({ data: { serie: "001", projet: "PY", reference: "RY" } });
      pending = actions.createBatchAction({ projet: "PY", reference: "RY", qty: 2 });
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(await pending).toEqual({ ok: false, error: "SERIAL_TAKEN" });
    expect(await prisma.batch.count()).toBe(before);
    expect(await prisma.unit.count({ where: { projet: "PY" } })).toBe(1);
  });
});
