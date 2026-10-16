import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));

import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "../mocks/db";
import { resetQueriesMock, loadUnits, UNITS } from "./queries-mock";
import {
  confirmMontageAction, confirmMontageBulkAction, retestUnitAction,
  confirmTestAction, confirmVerifAction, packUnitAction,
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
  it("Quand l'erreur n'est pas une Error, alors le message est « Erreur »", async () => {
    db.unit.findUnique.mockRejectedValue("boom");
    expect(await confirmMontageAction({ unitId: "U1", operator: "Ana" })).toEqual({ ok: false, error: "Erreur" });
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
  it("Quand toutes échouent sans Error, alors « Erreur »", async () => {
    db.unit.findUnique.mockRejectedValue("x");
    expect(await confirmMontageBulkAction({ unitIds: ["A"], operator: "Ana" })).toEqual({ ok: false, error: "Erreur" });
  });
});

describe("confirmTestAction — figé (#2)", () => {
  const base = { unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "accept", nc: "fissure" };
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
      data: { diel: "accept", pol: "accept", eff: "accept" }, note: null,
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
  it("Quand refus sans NC, alors nc null", async () => {
    db.unit.findUnique.mockResolvedValue(unitRow({ currentOperationKey: "test" }));
    await confirmTestAction({ ...base, pol: "refus", nc: "" });
    expect(db.unit.updateMany.mock.calls[0][0].data.nc).toBeNull();
  });
  it("Quand recordOperation lève, alors l'erreur est rendue", async () => {
    db.unit.findUnique.mockResolvedValue(null);
    expect(await confirmTestAction(base)).toEqual({ ok: false, error: "Unité introuvable" });
  });
  it("Quand l'erreur n'est pas une Error, alors « Erreur »", async () => {
    db.unit.findUnique.mockRejectedValue(1);
    expect(await confirmTestAction(base)).toEqual({ ok: false, error: "Erreur" });
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
    expect(await confirmVerifAction({ unitId: "U1", operator: "Ana" })).toEqual({ ok: false, error: "Erreur" });
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
      unitId: "U1", operationKey: "test", result: "rework", operator: "Ana", note: "réparé",
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
  it("Quand l'erreur n'est pas une Error, alors « Erreur »", async () => {
    db.unit.findUnique.mockRejectedValue("x");
    expect(await retestUnitAction(input)).toEqual({ ok: false, error: "Erreur" });
  });
});

describe("packUnitAction — figé (#2)", () => {
  const pret = { id: "U1", blocked: false, currentOperationKey: null, livraison: null };
  it("Quand l'entrée est invalide, alors échec", async () => {
    expect((await packUnitAction({ unitId: "U1", deliveryId: "" })).ok).toBe(false);
  });
  it("Quand l'unité est absente, alors « Unité introuvable »", async () => {
    loadUnits.mockResolvedValueOnce([]);
    expect(await packUnitAction({ unitId: "U1", deliveryId: "L1" })).toEqual({ ok: false, error: "Unité introuvable" });
  });
  it("Quand l'unité n'est pas prête, alors refus", async () => {
    loadUnits.mockResolvedValueOnce([{ ...pret, currentOperationKey: "test" }]);
    expect(await packUnitAction({ unitId: "U1", deliveryId: "L1" })).toEqual({ ok: false, error: "Unité non prête à emballer" });
  });
  it("Quand la livraison est absente, alors refus sans écrire", async () => {
    loadUnits.mockResolvedValueOnce([pret]);
    db.delivery.findUnique.mockResolvedValue(null);
    expect(await packUnitAction({ unitId: "U1", deliveryId: "L1" })).toEqual({ ok: false, error: "Livraison introuvable" });
    expect(db.unit.update).not.toHaveBeenCalled();
  });
  it("Quand tout est bon, alors l'unité est rattachée à la livraison", async () => {
    loadUnits.mockResolvedValueOnce([pret]);
    db.delivery.findUnique.mockResolvedValue({ id: "L1" });
    expect(await packUnitAction({ unitId: "U1", deliveryId: "L1" })).toEqual({ ok: true, units: UNITS });
    expect(db.delivery.findUnique).toHaveBeenCalledWith({ where: { id: "L1" } });
    expect(db.unit.update).toHaveBeenCalledWith({ where: { id: "U1" }, data: { deliveryId: "L1" } });
  });
});
