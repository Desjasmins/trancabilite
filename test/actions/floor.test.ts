import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));
// #3 : chaque action passe par withAccess → getActor ; session et en-têtes bouchonnés.
vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));
// #23 : stockage des photos bouchonné (GUARDRAILS §12).
const photoFiles = { exists: vi.fn(), signUpload: vi.fn(), signRead: vi.fn() };
const photoStorage = vi.fn((): typeof photoFiles | null => photoFiles);
vi.mock("@/lib/storage", () => ({ photoStorage: () => photoStorage() }));

import { prisma } from "@/lib/db";
import { resetDbMock, DB_NOW, type PrismaMock } from "../mocks/db";
import { setSession } from "../mocks/auth";
import { PROFILES } from "../access/profiles";
import { resetQueriesMock, loadUnits, UNITS } from "./queries-mock";
import { cookies, resetHeadersMock } from "../mocks/headers";
import { kioskCookieName } from "@/lib/access/kiosk";
import {
  confirmMontageAction, confirmMontageBulkAction, retestUnitAction,
  confirmTestAction, confirmVerifAction, packUnitAction, retestUnitOfficeAction,
} from "@/app/actions";

const db = prisma as unknown as PrismaMock;

/** Unité telle que `recordOperation` la lit (avec la gamme du lot, étapes NON triées). */
function unitRow(over: Record<string, unknown> = {}) {
  return {
    id: "U1", blocked: false, currentOperationKey: "montage", nc: null, version: 3,
    batch: { route: { steps: [
      { position: 2, operationKey: "test" },
      { position: 1, operationKey: "montage" },
      { position: 3, operationKey: "verification" },
    ] } },
    ...over,
  };
}

beforeEach(() => {
  resetDbMock();
  resetQueriesMock();
  resetHeadersMock();
  // #3 : aucune session — drapeau ACCESS_ENFORCE_FLOOR absent, l'acteur nul (anonyme sans cookie) reste assoupli (#5).
  setSession(null);
  db.unit.updateMany.mockResolvedValue({ count: 1 });
});

describe("recordOperation via confirmMontageAction — figé (#2)", () => {
  it("Quand l'entrée est invalide, alors le message Zod est rendu sans appel Prisma", async () => {
    expect(await confirmMontageAction({ unitId: "U1", operator: "" })).toEqual({ ok: false, error: "Opérateur requis" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("Quand l'unité est à l'étape, alors un événement done est créé et elle passe à l'étape suivante de la gamme triée", async () => {
    db.unit.findUnique.mockResolvedValue(unitRow());
    expect(await confirmMontageAction({ unitId: "U1", operator: "Ana" })).toEqual({ ok: true, units: UNITS });
    expect(db.unit.findUnique).toHaveBeenCalledWith({
      where: { id: "U1" },
      include: { batch: { include: { route: { include: { steps: true } } } } },
    });
    expect(db.traceEvent.create).toHaveBeenCalledWith({ data: {
      unitId: "U1", operationKey: "montage", result: "done", operator: "Ana", data: undefined, note: null,
      stationId: null, // #4 : aucun écran appairé → null (écran non identifié)
    } });
    expect(db.unit.updateMany).toHaveBeenCalledWith({
      where: { id: "U1", version: 3 },
      data: { currentOperationKey: "test", blocked: false, nc: null, version: { increment: 1 } },
    });
  });
  it("Quand l'unité n'a pas de gamme, alors l'étape suivante est null", async () => {
    db.unit.findUnique.mockResolvedValue(unitRow({ batch: null }));
    await confirmMontageAction({ unitId: "U1", operator: "Ana" });
    expect(db.unit.updateMany.mock.calls[0][0].data.currentOperationKey).toBeNull();
  });
  it.each([
    ["introuvable", null, "Unité introuvable"],
    ["bloquée", unitRow({ blocked: true }), "Unité bloquée (non conforme)"],
    ["à une autre étape", unitRow({ currentOperationKey: "test" }), "Cette unité n'est pas à cette étape"],
  ])("Quand l'unité est %s, alors l'action échoue sans écrire", async (_l, row, msg) => {
    db.unit.findUnique.mockResolvedValue(row);
    expect(await confirmMontageAction({ unitId: "U1", operator: "Ana" })).toEqual({ ok: false, error: msg });
    expect(db.traceEvent.create).not.toHaveBeenCalled();
    expect(loadUnits).not.toHaveBeenCalled();
  });
  it("Quand la version a changé, alors conflit de concurrence", async () => {
    db.unit.findUnique.mockResolvedValue(unitRow());
    db.unit.updateMany.mockResolvedValue({ count: 0 });
    expect(await confirmMontageAction({ unitId: "U1", operator: "Ana" }))
      .toEqual({ ok: false, error: "Conflit de concurrence, réessayez" });
    expect(db.unit.updateMany.mock.calls[0][0].where).toEqual({ id: "U1", version: 3 });
  });
  it("Quand l'erreur n'est pas une Error, alors GENERIC (D15, #3)", async () => {
    db.unit.findUnique.mockRejectedValue("boom");
    expect(await confirmMontageAction({ unitId: "U1", operator: "Ana" })).toEqual({ ok: false, error: "GENERIC" });
  });
});

describe("confirmMontageBulkAction — figé (#2)", () => {
  it("Quand l'entrée est invalide, alors message Zod", async () => {
    expect(await confirmMontageBulkAction({ unitIds: ["A"], operator: "" })).toEqual({ ok: false, error: "Opérateur requis" });
  });
  it("Quand une unité sur deux échoue, alors les autres passent et les compteurs sont rendus", async () => {
    db.unit.findUnique.mockResolvedValueOnce(unitRow({ id: "A" })).mockResolvedValueOnce(null);
    expect(await confirmMontageBulkAction({ unitIds: ["A", "B"], operator: "Ana" }))
      .toEqual({ ok: true, units: UNITS, doneCount: 1, failCount: 1 });
  });
  it("Quand toutes échouent, alors la première erreur est rendue", async () => {
    db.unit.findUnique.mockResolvedValueOnce(unitRow({ blocked: true })).mockResolvedValueOnce(null);
    expect(await confirmMontageBulkAction({ unitIds: ["A", "B"], operator: "Ana" }))
      .toEqual({ ok: false, error: "Unité bloquée (non conforme)" });
  });
  it("Quand toutes échouent sans Error, alors GENERIC (D15, #3)", async () => {
    db.unit.findUnique.mockRejectedValue("x");
    expect(await confirmMontageBulkAction({ unitIds: ["A"], operator: "Ana" })).toEqual({ ok: false, error: "GENERIC" });
  });
});

describe("confirmTestAction — figé (#2)", () => {
  const base = { unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "accept", visual: "accept", nc: "fissure" };
  it("Quand l'entrée est invalide, alors message Zod non vide", async () => {
    const r = await confirmTestAction({ ...base, diel: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
  it("Quand tout est accepté, alors pass, note null, étape suivante", async () => {
    db.unit.findUnique.mockResolvedValue(unitRow({ currentOperationKey: "test" }));
    expect(await confirmTestAction(base)).toEqual({ ok: true, units: UNITS });
    expect(db.traceEvent.create).toHaveBeenCalledWith({ data: {
      unitId: "U1", operationKey: "test", result: "pass", operator: "Ana",
      data: { diel: "accept", pol: "accept", eff: "accept", visual: "accept" }, note: null, stationId: null,
    } });
    expect(db.unit.updateMany.mock.calls[0][0].data).toEqual({
      currentOperationKey: "verification", blocked: false, nc: null, version: { increment: 1 },
    });
  });
  it("Quand un essai est refusé, alors fail, unité bloquée à la même étape avec la NC", async () => {
    db.unit.findUnique.mockResolvedValue(unitRow({ currentOperationKey: "test", nc: "ancienne" }));
    await confirmTestAction({ ...base, eff: "refus" });
    expect(db.traceEvent.create.mock.calls[0][0].data).toMatchObject({ result: "fail", note: "fissure" });
    expect(db.unit.updateMany.mock.calls[0][0].data).toEqual({
      currentOperationKey: "test", blocked: true, nc: "fissure", version: { increment: 1 },
    });
  });
  // #21 : le motif devient obligatoire dès qu'un essai est refusé (ancien contrat « refus sans NC → nc null » retiré).
  it.each(["diel", "pol", "eff", "visual"])("Quand %s est refusé sans motif, alors refus de l'entrée sans écrire", async (k) => {
    expect(await confirmTestAction({ ...base, [k]: "refus", nc: "  " })).toEqual({ ok: false, error: "NC_REQUIRED" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("Quand le visuel manque, alors refus de l'entrée", async () => {
    expect((await confirmTestAction({ ...base, visual: undefined })).ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("Quand recordOperation lève, alors l'erreur est rendue", async () => {
    db.unit.findUnique.mockResolvedValue(null);
    expect(await confirmTestAction(base)).toEqual({ ok: false, error: "Unité introuvable" });
  });
  it("Quand l'erreur n'est pas une Error, alors GENERIC (D15, #3)", async () => {
    db.unit.findUnique.mockRejectedValue(1);
    expect(await confirmTestAction(base)).toEqual({ ok: false, error: "GENERIC" });
  });
});

// #21 : essai visuel au Test ; un refus visuel renvoie au Montage sans bloquer.
describe("confirmTestAction — Étant donné l'essai visuel (#21)", () => {
  const base = { unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "accept", visual: "accept", nc: "" };
  const atTest = (over: Record<string, unknown> = {}) => unitRow({ currentOperationKey: "test", ...over });

  it("Quand seul le visuel est refusé, alors fail puis rework vers montage, aux heures t et t + 1 ms, non bloquée, une seule mise à jour", async () => {
    db.unit.findUnique.mockResolvedValue(atTest());
    expect(await confirmTestAction({ ...base, visual: "refus", nc: "rayure" })).toEqual({ ok: true, units: UNITS });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.traceEvent.create).toHaveBeenCalledTimes(2);
    expect(db.traceEvent.create.mock.calls[0][0]).toEqual({ data: {
      unitId: "U1", operationKey: "test", result: "fail", operator: "Ana",
      data: { diel: "accept", pol: "accept", eff: "accept", visual: "refus" }, note: "rayure", stationId: null,
      createdAt: DB_NOW,
    } });
    expect(db.traceEvent.create.mock.calls[1][0]).toEqual({ data: {
      unitId: "U1", operationKey: "test", result: "rework", operator: "Ana",
      data: { to: "montage", cause: "visual" }, note: "rayure", stationId: null,
      createdAt: new Date(DB_NOW.getTime() + 1),
    } });
    expect(db.unit.updateMany).toHaveBeenCalledTimes(1);
    expect(db.unit.updateMany).toHaveBeenCalledWith({
      where: { id: "U1", version: 3 },
      data: { currentOperationKey: "montage", blocked: false, nc: "rayure", version: { increment: 1 } },
    });
  });

  it("Quand visuel ET électrique sont refusés, alors renvoi au Montage sans blocage (décision de Gedeon), l'échec électrique reste au journal", async () => {
    db.unit.findUnique.mockResolvedValue(atTest());
    await confirmTestAction({ ...base, diel: "refus", visual: "refus", nc: "rayure + diel" });
    expect(db.traceEvent.create.mock.calls.map((c) => c[0].data.result)).toEqual(["fail", "rework"]);
    expect(db.traceEvent.create.mock.calls[0][0].data.data).toMatchObject({ diel: "refus", visual: "refus" });
    expect(db.unit.updateMany.mock.calls[0][0].data).toMatchObject({ currentOperationKey: "montage", blocked: false });
  });

  it("Quand seul un essai électrique est refusé, alors bloquée au Test, un seul événement, sans lire l'heure en base", async () => {
    db.unit.findUnique.mockResolvedValue(atTest());
    await confirmTestAction({ ...base, pol: "refus", nc: "inversée" });
    expect(db.traceEvent.create).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.unit.updateMany.mock.calls[0][0].data).toEqual({
      currentOperationKey: "test", blocked: true, nc: "inversée", version: { increment: 1 },
    });
  });

  it("Quand tout est accepté après un renvoi, alors pass et nc remis à null", async () => {
    db.unit.findUnique.mockResolvedValue(atTest({ nc: "rayure" }));
    await confirmTestAction(base);
    expect(db.unit.updateMany.mock.calls[0][0].data).toMatchObject({ currentOperationKey: "verification", nc: null });
  });

  it("Quand la version a changé pendant un renvoi, alors conflit et la transaction lève (rollback des deux événements)", async () => {
    db.unit.findUnique.mockResolvedValue(atTest());
    db.unit.updateMany.mockResolvedValue({ count: 0 });
    expect(await confirmTestAction({ ...base, visual: "refus", nc: "r" })).toEqual({ ok: false, error: "Conflit de concurrence, réessayez" });
    await expect(db.$transaction.mock.results[0].value).rejects.toThrow("Conflit de concurrence");
    expect(loadUnits).not.toHaveBeenCalled();
  });

  it.each([
    ["la gamme n'a pas de montage", [{ position: 1, operationKey: "test" }, { position: 2, operationKey: "verification" }]],
    ["le montage suit le test", [{ position: 1, operationKey: "test" }, { position: 2, operationKey: "montage" }]],
    ["l'unité n'a pas de gamme", null],
  ])("Quand %s, alors refus REWORK_TARGET_INVALID sans écrire", async (_l, steps) => {
    db.unit.findUnique.mockResolvedValue(atTest({ batch: steps ? { route: { steps } } : null }));
    expect(await confirmTestAction({ ...base, visual: "refus", nc: "r" })).toEqual({ ok: false, error: "REWORK_TARGET_INVALID" });
    expect(db.traceEvent.create).not.toHaveBeenCalled();
    expect(db.unit.updateMany).not.toHaveBeenCalled();
  });

  it("Quand l'unité est bloquée, alors aucun renvoi possible", async () => {
    db.unit.findUnique.mockResolvedValue(atTest({ blocked: true }));
    expect(await confirmTestAction({ ...base, visual: "refus", nc: "r" })).toEqual({ ok: false, error: "Unité bloquée (non conforme)" });
    expect(db.traceEvent.create).not.toHaveBeenCalled();
  });
});

describe("confirmTestAction, refus visuel — session et rôle vérifiés côté serveur (FLOOR_WRITE, #21)", () => {
  const input = { unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "accept", visual: "refus", nc: "r" };
  it.each([
    ["anonyme", null, "AUTH_REQUIRED"],
    ["client", PROFILES.client.session, "FORBIDDEN"],
  ] as const)("Quand un %s appelle avec ACCESS_ENFORCE_FLOOR, alors refus et rien n'est écrit", async (_n, session, code) => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setSession(session);
    db.unit.findUnique.mockResolvedValue(unitRow({ currentOperationKey: "test" }));
    expect(await confirmTestAction(input)).toEqual({ ok: false, error: code });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.traceEvent.create).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("Quand un superviseur appelle avec ACCESS_ENFORCE_FLOOR, alors le renvoi passe", async () => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true");
    setSession(PROFILES.superviseur.session);
    db.unit.findUnique.mockResolvedValue(unitRow({ currentOperationKey: "test" }));
    expect((await confirmTestAction(input)).ok).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("confirmMontageAction après renvoi — Étant donné une unité en reprise (#21)", () => {
  it("Quand le Montage est confirmé, alors nc est remis à null", async () => {
    db.unit.findUnique.mockResolvedValue(unitRow({ nc: "rayure" }));
    await confirmMontageAction({ unitId: "U1", operator: "Ana" });
    expect(db.unit.updateMany.mock.calls[0][0].data).toEqual({ currentOperationKey: "test", blocked: false, nc: null, version: { increment: 1 } });
  });
});

describe("confirmVerifAction — figé (#2)", () => {
  it("Quand l'entrée est invalide, alors échec", async () => {
    expect((await confirmVerifAction({ unitId: "" })).ok).toBe(false);
  });
  it("Quand l'unité est en vérification, alors done et fin de gamme", async () => {
    db.unit.findUnique.mockResolvedValue(unitRow({ currentOperationKey: "verification" }));
    expect(await confirmVerifAction({ unitId: "U1", operator: "Ana" })).toEqual({ ok: true, units: UNITS });
    expect(db.traceEvent.create.mock.calls[0][0].data).toMatchObject({ operationKey: "verification", result: "done" });
    expect(db.unit.updateMany.mock.calls[0][0].data.currentOperationKey).toBeNull();
  });
  it("Quand recordOperation lève (Error ou non), alors échec", async () => {
    db.unit.findUnique.mockResolvedValue(null);
    expect(await confirmVerifAction({ unitId: "U1", operator: "Ana" })).toEqual({ ok: false, error: "Unité introuvable" });
    db.unit.findUnique.mockRejectedValue(0);
    expect(await confirmVerifAction({ unitId: "U1", operator: "Ana" })).toEqual({ ok: false, error: "GENERIC" });
  });
});

describe("errorText — Étant donné une erreur technique pendant une action d'atelier (revue #3)", () => {
  it("Quand Prisma lève une Error, alors GENERIC : le message n'est pas divulgué, il part au journal serveur", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    db.unit.findUnique.mockRejectedValue(new Error("Can't reach database server at db.invalid:5432"));
    const res = await confirmMontageAction({ unitId: "U1", operator: "Ana" });
    expect(res).toEqual({ ok: false, error: "GENERIC" });
    expect(JSON.stringify(res)).not.toContain("db.invalid");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("retestUnitAction — figé (#2)", () => {
  const input = { unitId: "U1", operator: "Ana", note: "réparé" };
  it("Quand l'entrée est invalide, alors message Zod", async () => {
    expect(await retestUnitAction({ unitId: "U1", operator: "" })).toEqual({ ok: false, error: "Opérateur requis" });
  });
  it("Quand l'unité est bloquée, alors événement rework et déblocage", async () => {
    db.unit.findUnique.mockResolvedValue({ id: "U1", blocked: true, currentOperationKey: "test", version: 5 });
    expect(await retestUnitAction(input)).toEqual({ ok: true, units: UNITS });
    expect(db.unit.findUnique).toHaveBeenCalledWith({ where: { id: "U1" } });
    expect(db.traceEvent.create).toHaveBeenCalledWith({ data: {
      unitId: "U1", operationKey: "test", result: "rework", operator: "Ana", note: "réparé", stationId: null,
    } });
    expect(db.unit.updateMany).toHaveBeenCalledWith({
      where: { id: "U1", version: 5 }, data: { blocked: false, nc: null, version: { increment: 1 } },
    });
  });
  it("Quand la note est vide, alors note null", async () => {
    db.unit.findUnique.mockResolvedValue({ id: "U1", blocked: true, currentOperationKey: "test", version: 5 });
    await retestUnitAction({ unitId: "U1", operator: "Ana" });
    expect(db.traceEvent.create.mock.calls[0][0].data.note).toBeNull();
  });
  it.each([
    [null, "Unité introuvable"],
    [{ blocked: false, currentOperationKey: "test" }, "Cette unité n'est pas bloquée"],
    [{ blocked: true, currentOperationKey: null }, "Unité sans étape courante"],
  ])("Quand l'unité vaut %j, alors « %s »", async (row, msg) => {
    db.unit.findUnique.mockResolvedValue(row);
    expect(await retestUnitAction(input)).toEqual({ ok: false, error: msg });
    expect(db.traceEvent.create).not.toHaveBeenCalled();
  });
  it("Quand la version a changé, alors conflit", async () => {
    db.unit.findUnique.mockResolvedValue({ id: "U1", blocked: true, currentOperationKey: "test", version: 5 });
    db.unit.updateMany.mockResolvedValue({ count: 0 });
    expect(await retestUnitAction(input)).toEqual({ ok: false, error: "Conflit de concurrence, réessayez" });
  });
  it("Quand l'erreur n'est pas une Error, alors GENERIC (D15, #3)", async () => {
    db.unit.findUnique.mockRejectedValue("x");
    expect(await retestUnitAction(input)).toEqual({ ok: false, error: "GENERIC" });
  });
});

describe("packUnitAction — transaction + verrou de version (#8)", () => {
  const pret = (over: Record<string, unknown> = {}) =>
    ({ id: "U1", blocked: false, currentOperationKey: null, deliveryId: null, version: 7, ...over });
  const input = { unitId: "U1", deliveryId: "L1" };
  beforeEach(() => db.delivery.findUnique.mockResolvedValue({ id: "L1" }));

  it("Quand l'entrée est invalide, alors échec sans transaction", async () => {
    expect((await packUnitAction({ unitId: "U1", deliveryId: "" })).ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("Quand tout est bon, alors l'unité relue dans la transaction est rattachée sous verrou de version", async () => {
    db.unit.findUnique.mockResolvedValue(pret());
    expect(await packUnitAction(input)).toEqual({ ok: true, units: UNITS });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.unit.findUnique).toHaveBeenCalledWith({ where: { id: "U1" } });
    expect(db.delivery.findUnique).toHaveBeenCalledWith({ where: { id: "L1" } });
    expect(db.unit.updateMany).toHaveBeenCalledWith({
      where: { id: "U1", version: 7 }, data: { deliveryId: "L1", version: { increment: 1 } },
    });
    expect(db.unit.update).not.toHaveBeenCalled();
    expect(loadUnits).toHaveBeenCalledTimes(1);
  });
  it("Quand deux écrans emballent la même unité en même temps, alors un seul réussit", async () => {
    db.unit.findUnique.mockResolvedValue(pret());
    db.unit.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const [a, b] = await Promise.all([packUnitAction(input), packUnitAction({ unitId: "U1", deliveryId: "L2" })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(b).toEqual({ ok: false, error: "UNIT_PACK_CONFLICT" });
  });
  it.each([
    ["introuvable", null, "Unité introuvable"],
    ["devenue bloquée entre-temps", pret({ blocked: true }), "Unité non prête à emballer"],
    ["encore en gamme", pret({ currentOperationKey: "verification" }), "Unité non prête à emballer"],
    ["déjà emballée", pret({ deliveryId: "L0" }), "UNIT_ALREADY_PACKED"],
  ])("Quand l'unité relue est %s, alors échec sans écrire", async (_l, row, msg) => {
    db.unit.findUnique.mockResolvedValue(row);
    expect(await packUnitAction(input)).toEqual({ ok: false, error: msg });
    expect(db.unit.updateMany).not.toHaveBeenCalled();
    expect(loadUnits).not.toHaveBeenCalled();
  });
  it("Quand la livraison est absente, alors refus sans écrire", async () => {
    db.unit.findUnique.mockResolvedValue(pret());
    db.delivery.findUnique.mockResolvedValue(null);
    expect(await packUnitAction(input)).toEqual({ ok: false, error: "Livraison introuvable" });
    expect(db.unit.updateMany).not.toHaveBeenCalled();
  });
  it("Quand la base lève, alors fail GENERIC sans divulguer le message", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    db.unit.findUnique.mockRejectedValue(new Error("Can't reach database server at db.invalid:5432"));
    expect(await packUnitAction(input)).toEqual({ ok: false, error: "GENERIC" });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

// #4 : l'écran appairé est écrit au journal ; l'opérateur choisi à l'écran n'est jamais écrasé.
describe("stationId — Étant donné un écran d'atelier appairé (#4)", () => {
  beforeEach(async () => {
    (await cookies()).set(kioskCookieName(), "jeton-k7");
    db.kiosk.findUnique.mockResolvedValue({ id: "k7", label: "Établi 7", revokedAt: null, lastSeenAt: new Date() });
  });
  const ok = (key: string) => unitRow({ currentOperationKey: key });

  it.each([
    ["confirmMontageAction", () => confirmMontageAction({ unitId: "U1", operator: "Ana" }), "montage"],
    ["confirmMontageBulkAction", () => confirmMontageBulkAction({ unitIds: ["U1"], operator: "Ana" }), "montage"],
    ["confirmTestAction", () => confirmTestAction({ unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "refus", visual: "accept", nc: "x" }), "test"],
    ["confirmVerifAction", () => confirmVerifAction({ unitId: "U1", operator: "Ana" }), "verification"],
  ])("Quand %s passe, alors l'événement porte stationId = id de l'écran et l'opérateur saisi", async (_n, call, key) => {
    db.unit.findUnique.mockResolvedValue(ok(key));
    expect((await call()).ok).toBe(true);
    expect(db.traceEvent.create.mock.calls[0][0].data).toMatchObject({ stationId: "k7", operator: "Ana" });
  });

  it("Quand retestUnitAction passe, alors l'événement rework porte l'écran et l'opérateur saisi", async () => {
    db.unit.findUnique.mockResolvedValue({ id: "U1", blocked: true, currentOperationKey: "test", version: 5 });
    expect((await retestUnitAction({ unitId: "U1", operator: "Léo", note: "r" })).ok).toBe(true);
    expect(db.traceEvent.create.mock.calls[0][0].data).toMatchObject({ stationId: "k7", operator: "Léo", result: "rework" });
  });

  it("Quand un admin est aussi connecté sur l'écran, alors l'opérateur reste celui choisi à l'écran", async () => {
    setSession(PROFILES.admin.session);
    db.unit.findUnique.mockResolvedValue(ok("montage"));
    await confirmMontageAction({ unitId: "U1", operator: "Ana" });
    expect(db.traceEvent.create.mock.calls[0][0].data).toMatchObject({ stationId: "k7", operator: "Ana" });
  });

  it("Quand le cookie est inconnu, alors l'atelier passe toujours, stationId null", async () => {
    db.kiosk.findUnique.mockResolvedValue(null);
    db.unit.findUnique.mockResolvedValue(ok("montage"));
    expect((await confirmMontageAction({ unitId: "U1", operator: "Ana" })).ok).toBe(true);
    expect(db.traceEvent.create.mock.calls[0][0].data.stationId).toBeNull();
  });
});

// B1 (QA #4) : l'écran inscrit au registre vient du cookie, jamais de l'entrée du navigateur.
describe("stationId falsifié dans l'entrée — Étant donné un client qui envoie stationId: \"forge\"", () => {
  const forge = { stationId: "forge" };
  const blocked = { id: "U1", blocked: true, currentOperationKey: "test", version: 5 };
  const CASES: Array<[string, () => Promise<{ ok: boolean }>, Record<string, unknown>, () => void]> = [
    ["confirmMontageAction", () => confirmMontageAction({ unitId: "U1", operator: "Ana", ...forge }), unitRow(), () => {}],
    ["confirmMontageBulkAction", () => confirmMontageBulkAction({ unitIds: ["U1"], operator: "Ana", ...forge }), unitRow(), () => {}],
    ["confirmTestAction", () => confirmTestAction({ unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "accept", visual: "accept", nc: "", ...forge }), unitRow({ currentOperationKey: "test" }), () => {}],
    ["confirmVerifAction", () => confirmVerifAction({ unitId: "U1", operator: "Ana", ...forge }), unitRow({ currentOperationKey: "verification" }), () => {}],
    ["retestUnitAction", () => retestUnitAction({ unitId: "U1", operator: "Ana", note: "r", ...forge }), blocked, () => {}],
    ["retestUnitOfficeAction", () => retestUnitOfficeAction({ unitId: "U1", note: "r", ...forge }), blocked, () => setSession(PROFILES.superviseur.session)],
  ];

  it.each(CASES)("Quand %s est appelée sans écran, alors l'événement porte stationId null", async (_n, call, row, login) => {
    login();
    db.unit.findUnique.mockResolvedValue(row);
    expect((await call()).ok).toBe(true);
    expect(db.traceEvent.create.mock.calls[0][0].data.stationId).toBeNull();
  });

  it.each(CASES)("Quand %s est appelée depuis un écran appairé, alors l'événement porte l'id du Kiosk", async (_n, call, row, login) => {
    login();
    (await cookies()).set(kioskCookieName(), "jeton-k7");
    db.kiosk.findUnique.mockResolvedValue({ id: "k7", label: "Établi 7", revokedAt: null, lastSeenAt: new Date() });
    db.unit.findUnique.mockResolvedValue(row);
    expect((await call()).ok).toBe(true);
    expect(db.traceEvent.create.mock.calls[0][0].data.stationId).toBe("k7");
  });
});

describe("confirmTestAction — Étant donné une photo de défaut (#23)", () => {
  const refus = { unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "accept", visual: "refus", nc: "rayure" };
  const PHOTO = "units/U1/1f0e.jpg";
  beforeEach(() => {
    photoStorage.mockImplementation(() => photoFiles);
    photoFiles.exists.mockReset();
    photoFiles.exists.mockResolvedValue(true);
    db.unit.findUnique.mockResolvedValue(unitRow({ currentOperationKey: "test" }));
  });

  it("Quand la photo existe sous le préfixe de l'unité, alors data.photo est écrit dans l'événement fail", async () => {
    expect(await confirmTestAction({ ...refus, photoPath: PHOTO })).toEqual({ ok: true, units: UNITS });
    expect(photoFiles.exists).toHaveBeenCalledWith(PHOTO);
    expect(db.traceEvent.create.mock.calls[0][0].data.data).toEqual({
      diel: "accept", pol: "accept", eff: "accept", visual: "refus", photo: PHOTO,
    });
  });
  it("Quand le chemin vise une autre unité, alors PHOTO_PATH_INVALID, sans stockage ni événement", async () => {
    expect(await confirmTestAction({ ...refus, photoPath: "units/U2/1f0e.jpg" })).toEqual({ ok: false, error: "PHOTO_PATH_INVALID" });
    expect(photoFiles.exists).not.toHaveBeenCalled();
    expect(db.traceEvent.create).not.toHaveBeenCalled();
  });
  it.each(["units/U1/../U2/a.jpg", "units/U1/a.gif", "a.jpg"])("Quand le chemin est mal formé (%s), alors refus", async (photoPath) => {
    expect(await confirmTestAction({ ...refus, photoPath })).toEqual({ ok: false, error: "PHOTO_PATH_INVALID" });
  });
  it("Quand le visuel est accepté, alors une photo est refusée", async () => {
    expect(await confirmTestAction({ ...refus, visual: "accept", diel: "refus", photoPath: PHOTO })).toEqual({ ok: false, error: "PHOTO_PATH_INVALID" });
    expect(db.traceEvent.create).not.toHaveBeenCalled();
  });
  it("Quand le fichier n'est pas dans le bucket, alors PHOTO_NOT_FOUND, sans événement", async () => {
    photoFiles.exists.mockResolvedValue(false);
    expect(await confirmTestAction({ ...refus, photoPath: PHOTO })).toEqual({ ok: false, error: "PHOTO_NOT_FOUND" });
    expect(db.traceEvent.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled(); // vérification hors transaction (revue d)
  });
  it("Quand le bucket est injoignable, alors PHOTO_UNAVAILABLE (pas GENERIC), sans événement", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    photoFiles.exists.mockRejectedValue(new Error("503"));
    expect(await confirmTestAction({ ...refus, photoPath: PHOTO })).toEqual({ ok: false, error: "PHOTO_UNAVAILABLE" });
    expect(db.traceEvent.create).not.toHaveBeenCalled();
  });
  it("Quand le stockage n'est pas configuré, alors PHOTO_UNAVAILABLE, sans événement", async () => {
    photoStorage.mockImplementation(() => null);
    expect(await confirmTestAction({ ...refus, photoPath: PHOTO })).toEqual({ ok: false, error: "PHOTO_UNAVAILABLE" });
    expect(db.traceEvent.create).not.toHaveBeenCalled();
  });
  it("Quand il n'y a pas de photo, alors le stockage n'est jamais consulté et data sans photo", async () => {
    await confirmTestAction(refus);
    expect(photoFiles.exists).not.toHaveBeenCalled();
    expect(db.traceEvent.create.mock.calls[0][0].data.data).not.toHaveProperty("photo");
  });
});
