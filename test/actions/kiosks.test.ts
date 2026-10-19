import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));
vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "../mocks/db";
import { setSession } from "../mocks/auth";
import { cookies, cookieOptionsOf, resetHeadersMock } from "../mocks/headers";
import { resetQueriesMock } from "./queries-mock";
import { hashKioskToken, kioskCookieName } from "@/lib/access/kiosk";
import { PROFILES } from "../access/profiles";
import {
  pairKioskAction, revokeKioskAction, renameKioskAction, listKiosksAction, confirmMontageAction,
} from "@/app/actions";

const db = prisma as unknown as PrismaMock;
const COOKIE = kioskCookieName();

type Row = { id: string; label: string; tokenHash: string; createdById: string; createdAt: Date; lastSeenAt: Date | null; revokedAt: Date | null };
let table: Row[];
let seq: number;

/** Table `kiosks` en mémoire : assez de Prisma pour suivre un appairage de bout en bout. */
function fakeKioskTable() {
  table = [];
  seq = 0;
  const match = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => r[k as keyof Row] === v);
  db.kiosk.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    table.find((r) => match(r, where)) ?? null);
  db.kiosk.findMany.mockImplementation(async () => [...table].sort((a, b) => +b.createdAt - +a.createdAt));
  db.kiosk.create.mockImplementation(async ({ data }: { data: Partial<Row> }) => {
    const row = { id: `k${++seq}`, createdAt: new Date(Date.now() + seq), lastSeenAt: null, revokedAt: null, ...data } as Row;
    table.push(row);
    return row;
  });
  db.kiosk.updateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
    const hit = table.filter((r) => match(r, where));
    for (const r of hit) Object.assign(r, data);
    return { count: hit.length };
  });
  db.kiosk.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
    const r = table.find((x) => x.id === where.id)!;
    return Object.assign(r, data);
  });
}

async function cookieValue() {
  return (await cookies()).get(COOKIE)?.value;
}

beforeEach(() => {
  resetDbMock();
  resetHeadersMock();
  resetQueriesMock();
  fakeKioskTable();
  setSession(PROFILES.admin.session);
});

describe("pairKioskAction — Étant donné un admin connecté sur l'écran", () => {
  it("Quand il enregistre l'écran, alors un jeton est posé en cookie et seule son empreinte est stockée", async () => {
    const res = await pairKioskAction({ label: "  Établi 2 " });
    expect(res.ok).toBe(true);
    const token = await cookieValue();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieOptionsOf(COOKIE)).toEqual({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 34_560_000 });
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({ label: "Établi 2", tokenHash: hashKioskToken(token!), createdById: "u-admin", revokedAt: null });
    expect(JSON.stringify(table)).not.toContain(token);
    expect(res.kiosks).toEqual([
      { id: "k1", label: "Établi 2", createdAt: table[0].createdAt.toISOString(), lastSeenAt: null, revokedAt: null },
    ]);
  });

  it("Quand le nom est vide, alors message Zod et rien n'est écrit", async () => {
    const res = await pairKioskAction({ label: "   " });
    expect(res).toEqual({ ok: false, error: "Nom de l'écran requis" });
    expect(table).toHaveLength(0);
    expect(await cookieValue()).toBeUndefined();
  });

  it("Quand l'écran était déjà appairé, alors l'ancien est révoqué et le nouveau créé dans UNE transaction", async () => {
    await pairKioskAction({ label: "Ancien" });
    const old = await cookieValue();
    db.$transaction.mockClear();
    await pairKioskAction({ label: "Nouveau" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(table.map((r) => [r.label, r.revokedAt !== null])).toEqual([["Ancien", true], ["Nouveau", false]]);
    expect(await cookieValue()).not.toBe(old);
    expect(table[1].tokenHash).toBe(hashKioskToken((await cookieValue())!));
  });

  it("Quand la création échoue, alors l'ancien n'est pas révoqué hors transaction et le cookie ne change pas", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await pairKioskAction({ label: "Ancien" });
    const old = await cookieValue();
    db.$transaction.mockImplementationOnce(async () => { throw new Error("base"); });
    expect(await pairKioskAction({ label: "Nouveau" })).toEqual({ ok: false, error: "GENERIC" });
    expect(await cookieValue()).toBe(old);
    err.mockRestore();
  });

  it.each(["superviseur", "client", "anonyme"] as const)("Quand %s tente d'appairer, alors refus et rien n'est écrit", async (p) => {
    setSession(PROFILES[p].session);
    const res = await pairKioskAction({ label: "X" });
    expect(res.ok).toBe(false);
    expect(table).toHaveLength(0);
    expect(await cookieValue()).toBeUndefined();
  });
});

describe("revokeKioskAction — Étant donné un écran appairé", () => {
  it("Quand l'admin retire l'accès, alors l'appel suivant de cet écran est refusé KIOSK_REVOKED", async () => {
    await pairKioskAction({ label: "Établi 2" });
    // L'admin se déconnecte : l'écran fonctionne seul.
    setSession(null);
    db.unit.findUnique.mockResolvedValue(null);
    expect((await confirmMontageAction({ unitId: "U1", operator: "Ana" })).error).not.toBe("KIOSK_REVOKED");

    setSession(PROFILES.admin.session);
    const res = await revokeKioskAction({ id: "k1" });
    expect(res.ok).toBe(true);
    expect(res.kiosks?.[0].revokedAt).toEqual(expect.any(String));

    setSession(null);
    db.unit.findUnique.mockClear();
    expect(await confirmMontageAction({ unitId: "U1", operator: "Ana" })).toEqual({ ok: false, error: "KIOSK_REVOKED" });
    expect(db.unit.findUnique).not.toHaveBeenCalled();
  });

  it("Quand on révoque deux fois, alors la date de la première révocation est gardée", async () => {
    await pairKioskAction({ label: "Établi 2" });
    await revokeKioskAction({ id: "k1" });
    const first = table[0].revokedAt;
    await revokeKioskAction({ id: "k1" });
    expect(table[0].revokedAt).toBe(first);
  });

  it("Quand l'id est vide, alors message Zod", async () => {
    expect(await revokeKioskAction({ id: "" })).toEqual({ ok: false, error: "Écran requis" });
  });

  it("Quand un superviseur tente de révoquer, alors FORBIDDEN", async () => {
    setSession(PROFILES.superviseur.session);
    expect(await revokeKioskAction({ id: "k1" })).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("renameKioskAction et listKiosksAction", () => {
  it("Quand l'admin renomme, alors le libellé change (le journal ne garde que l'id)", async () => {
    await pairKioskAction({ label: "Établi 2" });
    const res = await renameKioskAction({ id: "k1", label: "Établi 3" });
    expect(res.ok).toBe(true);
    expect(table[0].label).toBe("Établi 3");
  });

  it("Quand l'écran n'existe pas, alors le code traduit KIOSK_NOT_FOUND", async () => {
    expect(await renameKioskAction({ id: "nope", label: "X" })).toEqual({ ok: false, error: "KIOSK_NOT_FOUND" });
  });

  it("Quand le nouveau nom est vide, alors message Zod", async () => {
    expect(await renameKioskAction({ id: "k1", label: "" })).toEqual({ ok: false, error: "Nom de l'écran requis" });
  });

  it("Quand l'admin liste, alors les écrans du plus récent au plus ancien, révoqués compris", async () => {
    await pairKioskAction({ label: "A" });
    await pairKioskAction({ label: "B" }); // révoque A
    const res = await listKiosksAction();
    expect(res.kiosks?.map((k) => [k.label, k.revokedAt !== null])).toEqual([["B", false], ["A", true]]);
  });

  it("Quand un superviseur liste, alors FORBIDDEN", async () => {
    setSession(PROFILES.superviseur.session);
    expect(await listKiosksAction()).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("libellé unique parmi les écrans actifs (#4, tour 2)", () => {
  it("Quand on appaire un 2e écran actif sous le même nom (espaces compris), alors KIOSK_LABEL_TAKEN et rien n'est écrit", async () => {
    await pairKioskAction({ label: "Établi 2" });
    resetHeadersMock(); // autre navigateur
    const res = await pairKioskAction({ label: " Établi 2 " });
    expect(res).toEqual({ ok: false, error: "KIOSK_LABEL_TAKEN" });
    expect(table).toHaveLength(1);
    expect(await cookieValue()).toBeUndefined();
  });

  it("Quand l'écran du même nom est révoqué, alors le nom est libre", async () => {
    await pairKioskAction({ label: "Établi 2" });
    await revokeKioskAction({ id: "k1" });
    resetHeadersMock();
    expect((await pairKioskAction({ label: "Établi 2" })).ok).toBe(true);
  });

  it("Quand on ré-appaire le même navigateur sous son propre nom, alors c'est permis (l'ancien est révoqué)", async () => {
    await pairKioskAction({ label: "Établi 2" });
    expect((await pairKioskAction({ label: "Établi 2" })).ok).toBe(true);
    expect(table.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });

  it("Quand on renomme vers le nom d'un autre écran actif, alors KIOSK_LABEL_TAKEN ; vers son propre nom, permis", async () => {
    await pairKioskAction({ label: "A" });
    resetHeadersMock();
    await pairKioskAction({ label: "B" });
    expect(await renameKioskAction({ id: "k2", label: "A" })).toEqual({ ok: false, error: "KIOSK_LABEL_TAKEN" });
    expect(table[1].label).toBe("B");
    expect((await renameKioskAction({ id: "k2", label: "B" })).ok).toBe(true);
  });
});
