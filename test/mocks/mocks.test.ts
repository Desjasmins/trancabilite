import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("./db"));
vi.mock("@/lib/auth", () => import("./auth"));
vi.mock("next/headers", () => import("./headers"));

import { prisma } from "@/lib/db";
import { resetDbMock, MODEL_DELEGATES, type PrismaMock } from "./db";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { setSession, sessionFor } from "./auth";
import { headers, cookies } from "next/headers";
import { setHeaders, resetHeadersMock, cookieOptionsOf } from "./headers";

const db = prisma as unknown as PrismaMock;

describe("bouchon @/lib/db — Étant donné le client Prisma bouchonné", () => {
  beforeEach(() => resetDbMock());

  it("Quand on compare aux modèles du client généré, alors chaque modèle a son délégué et aucun autre", () => {
    const attendus = Object.values(Prisma.ModelName).map((m) => m[0].toLowerCase() + m.slice(1)).sort();
    expect([...MODEL_DELEGATES].sort()).toEqual(attendus);
    const delegues = Object.keys(db).filter((k) => !k.startsWith("$")).sort();
    expect(delegues).toEqual(attendus);
  });
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
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
  it("Quand une session est réglée, alors auth.api.getSession rend { session, user } comme Better Auth", async () => {
    setSession(sessionFor({ id: "u", name: "Ana", role: "admin" }));
    const r = await auth.api.getSession({ headers: new Headers() });
    expect(r?.user).toEqual({ id: "u", name: "Ana", role: "admin" });
    expect(r?.session).toMatchObject({ id: "s-u", userId: "u", token: "jeton-factice" });
    expect(r?.session.expiresAt).toBeInstanceOf(Date);
  });
  it("Quand on cherche un export nommé getSession, alors il n'existe pas (seul auth.api.getSession)", async () => {
    expect(Object.keys(await import("./auth"))).not.toContain("getSession");
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
  it("Quand on pose des cookies avec options, alors getAll les liste et les options sont conservées", async () => {
    const jar = await cookies();
    jar.set("a", "1", { httpOnly: true, secure: true, maxAge: 60 });
    jar.set("b", "2");
    expect(jar.getAll()).toEqual([{ name: "a", value: "1" }, { name: "b", value: "2" }]);
    expect(cookieOptionsOf("a")).toEqual({ httpOnly: true, secure: true, maxAge: 60 });
    expect(cookieOptionsOf("b")).toBeUndefined();
    jar.set("a", "3");
    expect(cookieOptionsOf("a")).toBeUndefined();
    jar.set("b", "4", { path: "/" });
    jar.delete("b");
    expect(cookieOptionsOf("b")).toBeUndefined();
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
