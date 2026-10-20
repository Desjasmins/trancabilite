import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));
vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "../mocks/db";
import { setSession } from "../mocks/auth";
import { resetHeadersMock } from "../mocks/headers";
import { resetQueriesMock, DELIVERIES } from "./queries-mock";
import { PROFILES } from "../access/profiles";
import { createDeliveryAction, closeDeliveryAction } from "@/app/actions";

const db = prisma as unknown as PrismaMock;
type Row = { id: string; client: string | null; closed: boolean };
let table: Row[];

/** Table `deliveries` en mémoire avec contrainte d'unicité : un doublon lève P2002 comme Prisma. */
function fakeDeliveryTable() {
  table = [];
  db.delivery.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    table.find((r) => r.id === where.id) ?? null);
  const insert = async (data: Row) => {
    await Promise.resolve(); // laisse l'autre requête concurrente passer sa lecture
    if (table.some((r) => r.id === data.id))
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    table.push({ ...data });
    return data;
  };
  db.delivery.create.mockImplementation(async ({ data }: { data: Row }) => insert(data));
  db.delivery.upsert.mockImplementation(async ({ where, create }: { where: { id: string }; create: Row }) => {
    const hit = table.find((r) => r.id === where.id);
    return hit ?? insert(create);
  });
  db.delivery.updateMany.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
    const hit = table.filter((r) => r.id === where.id);
    for (const r of hit) Object.assign(r, data);
    return { count: hit.length };
  });
  db.delivery.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
    const r = table.find((x) => x.id === where.id);
    if (!r) throw Object.assign(new Error("Record not found"), { code: "P2025" });
    return Object.assign(r, data);
  });
}

beforeEach(() => {
  resetDbMock();
  resetHeadersMock();
  resetQueriesMock();
  fakeDeliveryTable();
  setSession(PROFILES.superviseur.session);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createDeliveryAction (#9)", () => {
  it("Quand deux créations simultanées portent le même identifiant, alors les deux réussissent et une seule ligne existe", async () => {
    const [a, b] = await Promise.all([
      createDeliveryAction({ id: "L-100", client: "ACME" }),
      createDeliveryAction({ id: "L-100", client: "ACME" }),
    ]);
    expect(a).toEqual({ ok: true, deliveries: DELIVERIES });
    expect(b).toEqual({ ok: true, deliveries: DELIVERIES });
    expect(table).toEqual([{ id: "L-100", client: "ACME", closed: false }]);
  });

  it("Quand l'identifiant existe déjà, alors la création est acceptée sans modifier la livraison", async () => {
    table.push({ id: "L-1", client: "Ancien", closed: true });
    expect((await createDeliveryAction({ id: "L-1", client: "Nouveau" })).ok).toBe(true);
    expect(table).toEqual([{ id: "L-1", client: "Ancien", closed: true }]);
  });

  it("Quand la base échoue, alors l'action renvoie GENERIC sans divulguer l'erreur", async () => {
    db.delivery.findUnique.mockRejectedValue(new Error("connexion perdue"));
    db.delivery.create.mockRejectedValue(new Error("connexion perdue"));
    db.delivery.upsert.mockRejectedValue(new Error("connexion perdue"));
    expect(await createDeliveryAction({ id: "L-2", client: "" })).toEqual({ ok: false, error: "GENERIC" });
  });
});

describe("closeDeliveryAction (#9)", () => {
  it("Quand la livraison existe, alors elle est fermée", async () => {
    table.push({ id: "L-1", client: null, closed: false });
    expect(await closeDeliveryAction({ id: "L-1" })).toEqual({ ok: true, deliveries: DELIVERIES });
    expect(table[0].closed).toBe(true);
  });

  it("Quand la livraison est déjà fermée, alors la fermeture reste acceptée", async () => {
    table.push({ id: "L-1", client: null, closed: true });
    expect((await closeDeliveryAction({ id: "L-1" })).ok).toBe(true);
  });

  it("Quand l'identifiant est inconnu, alors l'action renvoie DELIVERY_NOT_FOUND", async () => {
    expect(await closeDeliveryAction({ id: "L-404" })).toEqual({ ok: false, error: "DELIVERY_NOT_FOUND" });
  });

  it("Quand la base échoue, alors l'action renvoie GENERIC", async () => {
    db.delivery.updateMany.mockRejectedValue(new Error("connexion perdue"));
    db.delivery.update.mockRejectedValue(new Error("connexion perdue"));
    expect(await closeDeliveryAction({ id: "L-1" })).toEqual({ ok: false, error: "GENERIC" });
  });
});
