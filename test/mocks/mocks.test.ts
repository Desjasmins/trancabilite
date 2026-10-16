import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("./db"));
vi.mock("@/lib/auth", () => import("./auth"));
vi.mock("next/headers", () => import("./headers"));

import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "./db";
import { auth } from "@/lib/auth";
import { getSession, setSession } from "./auth";
import { headers, cookies } from "next/headers";
import { setHeaders, resetHeadersMock } from "./headers";

const db = prisma as unknown as PrismaMock;

describe("bouchon @/lib/db — Étant donné le client Prisma bouchonné", () => {
  beforeEach(() => resetDbMock());

  it("Quand on importe @/lib/db, alors on reçoit le bouchon (aucune connexion)", () => {
    expect(vi.isMockFunction(db.unit.findMany)).toBe(true);
  });
  it("Quand $transaction reçoit un callback, alors il est appelé avec le client et son résultat est rendu", async () => {
    db.unit.update.mockResolvedValue({ id: "U1" });
    const r = await db.$transaction(async (tx: PrismaMock) => tx.unit.update({ where: { id: "U1" } }));
    expect(r).toEqual({ id: "U1" });
    expect(db.unit.update).toHaveBeenCalledTimes(1);
  });
  it("Quand $transaction reçoit un tableau, alors toutes les promesses sont attendues dans l'ordre", async () => {
    const r = await db.$transaction([Promise.resolve(1), Promise.resolve(2)]);
    expect(r).toEqual([1, 2]);
  });
  it("Quand $transaction reçoit autre chose, alors il lève", async () => {
    await expect(db.$transaction(42)).rejects.toThrow(TypeError);
  });
  it("Quand on remet à zéro, alors les valeurs programmées disparaissent", async () => {
    db.unit.findMany.mockResolvedValue([1]);
    resetDbMock();
    expect(await db.unit.findMany()).toBeUndefined();
  });
});

describe("bouchon @/lib/auth — Étant donné la session bouchonnée", () => {
  it("Quand rien n'est réglé, alors aucune session", async () => {
    expect(await getSession()).toBeNull();
  });
  it("Quand une session est réglée, alors getSession et auth.api.getSession la rendent", async () => {
    setSession({ user: { id: "u", name: "Ana", role: "admin" } });
    expect((await auth.api.getSession({ headers: new Headers() }))?.user.name).toBe("Ana");
    expect((await getSession())?.user.role).toBe("admin");
  });
});

describe("bouchon next/headers — Étant donné des en-têtes et cookies en mémoire", () => {
  beforeEach(() => resetHeadersMock());

  it("Quand on règle des en-têtes, alors headers() les rend", async () => {
    setHeaders({ origin: "http://localhost:3000" });
    expect((await headers()).get("origin")).toBe("http://localhost:3000");
  });
  it("Quand on pose puis supprime un cookie, alors get/has le reflètent", async () => {
    const jar = await cookies();
    expect(jar.get("k")).toBeUndefined();
    jar.set("k", "v");
    expect(jar.get("k")).toEqual({ name: "k", value: "v" });
    expect(jar.has("k")).toBe(true);
    jar.delete("k");
    expect(jar.has("k")).toBe(false);
  });
  it("Quand on remet à zéro, alors en-têtes et cookies sont vides", async () => {
    setHeaders({ a: "1" });
    (await cookies()).set("k", "v");
    resetHeadersMock();
    expect((await headers()).get("a")).toBeNull();
    expect((await cookies()).has("k")).toBe(false);
  });
});

describe("vitest.config — Étant donné un module serveur qui importe « server-only »", () => {
  it("Quand on l'importe sous Vitest, alors il se charge (server-only remplacé par un module vide)", async () => {
    await expect(import("server-only")).resolves.toBeDefined();
  });
});
