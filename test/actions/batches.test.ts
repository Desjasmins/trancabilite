import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));
// #3 : chaque action passe par withAccess → getActor ; session et en-têtes bouchonnés.
vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "../mocks/db";
import { setSession } from "../mocks/auth";
import { PROFILES } from "../access/profiles";
import { resetQueriesMock, loadUnits, UNITS, BATCHES } from "./queries-mock";
import { createBatchAction, updateBatchAction, markPrintedAction } from "@/app/actions";

const db = prisma as unknown as PrismaMock;
const steps = [{ position: 2, operationKey: "test" }, { position: 1, operationKey: "assemblage" }];

beforeEach(() => {
  resetDbMock();
  resetQueriesMock();
  setSession(PROFILES.admin.session); // #3 : les écritures du Bureau exigent un staff
  db.batch.create.mockResolvedValue({ id: "B1" });
  // `$transaction([...])` du bouchon fait Promise.all des promesses rendues par unit.create.
  let i = 0;
  db.unit.create.mockImplementation(async () => ({ id: `N${++i}` }));
});

describe("createBatchAction — figé (#2)", () => {
  const input = { po: "PO1", projet: "P", reference: "R", qty: 2, operator: "Ana", sub: "" };
  it("Quand l'entrée est invalide, alors message Zod sans écrire", async () => {
    expect(await createBatchAction({ ...input, projet: "" })).toEqual({ ok: false, error: "Projet requis" });
    expect(db.batch.create).not.toHaveBeenCalled();
  });
  it("Quand une gamme est demandée, alors lot + N unités à la 1re étape triée, séries suivant l'existant", async () => {
    db.route.findUnique.mockResolvedValue({ id: "G1", steps });
    loadUnits.mockResolvedValueOnce([{ projet: "P", reference: "R", serie: "007" }]);
    const r = await createBatchAction({ ...input, routeId: "G1" });
    expect(r).toEqual({ ok: true, units: UNITS, batches: BATCHES, createdIds: ["N1", "N2"] });
    expect(db.route.findUnique).toHaveBeenCalledWith({ where: { id: "G1" }, include: { steps: true } });
    expect(db.batch.create).toHaveBeenCalledWith({ data: {
      po: "PO1", projet: "P", reference: "R", sub: null, createdBy: "Ana", routeId: "G1",
    } });
    const first = db.unit.create.mock.calls[0][0];
    expect(first).toMatchObject({ data: {
      serie: "008", projet: "P", reference: "R", po: "PO1", sub: null, batchId: "B1",
      etiquettePar: "Ana", etiquetteImprimee: false, currentOperationKey: "assemblage",
    }, select: { id: true } });
    expect(first.data.etiquetteDate).toBeInstanceOf(Date);
    expect(db.unit.create.mock.calls[1][0].data.serie).toBe("009");
  });
  it("Quand aucune gamme n'est demandée, alors la gamme par défaut est cherchée", async () => {
    db.route.findFirst.mockResolvedValueOnce({ id: "DEF", steps });
    await createBatchAction(input);
    expect(db.route.findUnique).not.toHaveBeenCalled();
    expect(db.route.findFirst).toHaveBeenCalledWith({ where: { isDefault: true }, include: { steps: true } });
    expect(db.batch.create.mock.calls[0][0].data.routeId).toBe("DEF");
  });
  it("Quand ni demandée ni par défaut, alors n'importe quelle gamme ; sinon aucune et étape « montage »", async () => {
    db.route.findUnique.mockResolvedValue(null);
    db.route.findFirst.mockResolvedValue(null);
    await createBatchAction({ ...input, routeId: "X", start: "50", po: "", operator: null, qty: 1 });
    expect(db.route.findFirst).toHaveBeenNthCalledWith(2, { include: { steps: true } });
    expect(db.batch.create.mock.calls[0][0].data).toMatchObject({ po: null, createdBy: null, routeId: null });
    expect(db.unit.create.mock.calls[0][0].data).toMatchObject({
      serie: "050", po: null, etiquettePar: null, currentOperationKey: "montage",
    });
  });
});

describe("updateBatchAction — figé (#2)", () => {
  const input = { batchId: "B1", po: "", projet: "P2", reference: "R2", sub: "S", routeId: "G2" };
  const ev = (operationKey: string, result: string) => ({ operationKey, result });
  function batchRow(routeId: string) {
    return { id: "B1", routeId, units: [
      { id: "U1", blocked: false, deliveryId: null, events: [ev("assemblage", "done"), ev("test", "fail")] },
      { id: "U2", blocked: true, deliveryId: null, events: [] },
      { id: "U3", blocked: false, deliveryId: "L1", events: [] },
      { id: "U4", blocked: false, deliveryId: null, events: [ev("assemblage", "pass"), ev("test", "pass")] },
    ] };
  }
  const copied = { projet: "P2", reference: "R2", po: null, sub: "S" };
  it("Quand l'entrée est invalide, alors message Zod", async () => {
    expect(await updateBatchAction({ ...input, routeId: "" })).toEqual({ ok: false, error: "Gamme requise" });
  });
  it("Quand la gamme change, alors champs propagés et étape recalculée (sauf bloquées/livrées)", async () => {
    db.batch.findUnique.mockResolvedValue(batchRow("G1"));
    db.route.findUnique.mockResolvedValue({ id: "G2", steps });
    expect(await updateBatchAction(input)).toEqual({ ok: true, units: UNITS, batches: BATCHES });
    expect(db.batch.findUnique).toHaveBeenCalledWith({
      where: { id: "B1" }, include: { units: { include: { events: true } } },
    });
    expect(db.route.findUnique).toHaveBeenCalledWith({ where: { id: "G2" }, include: { steps: true } });
    expect(db.batch.update).toHaveBeenCalledWith({ where: { id: "B1" }, data: { ...copied, routeId: "G2" } });
    expect(db.unit.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "U1" }, data: { ...copied, currentOperationKey: "test", version: { increment: 1 } } },
      { where: { id: "U2" }, data: copied },
      { where: { id: "U3" }, data: copied },
      { where: { id: "U4" }, data: { ...copied, currentOperationKey: null, version: { increment: 1 } } },
    ]);
  });
  it("Quand la gamme ne change pas, alors aucune étape n'est recalculée", async () => {
    db.batch.findUnique.mockResolvedValue(batchRow("G2"));
    db.route.findUnique.mockResolvedValue({ id: "G2", steps });
    await updateBatchAction(input);
    for (const c of db.unit.update.mock.calls) expect(c[0].data).toEqual(copied);
  });
  it("Quand le sous-traitant est vide, alors sub null sur le lot et les unités", async () => {
    db.batch.findUnique.mockResolvedValue(batchRow("G2"));
    db.route.findUnique.mockResolvedValue({ id: "G2", steps });
    await updateBatchAction({ ...input, sub: "" });
    expect(db.batch.update.mock.calls[0][0].data.sub).toBeNull();
    for (const c of db.unit.update.mock.calls) expect(c[0].data.sub).toBeNull();
  });
  it.each([
    ["lot", null, { id: "G2", steps }, "Lot introuvable"],
    ["gamme", batchRow("G1"), null, "Gamme introuvable"],
  ])("Quand le %s est introuvable, alors échec sans écrire", async (_l, b, g, msg) => {
    db.batch.findUnique.mockResolvedValue(b);
    db.route.findUnique.mockResolvedValue(g);
    expect(await updateBatchAction(input)).toEqual({ ok: false, error: msg });
    expect(db.batch.update).not.toHaveBeenCalled();
  });
  it("Quand l'erreur n'est pas une Error, alors GENERIC (D15, #3)", async () => {
    db.batch.findUnique.mockRejectedValue("x");
    expect(await updateBatchAction(input)).toEqual({ ok: false, error: "GENERIC" });
  });
});

describe("markPrintedAction — figé (#2)", () => {
  it("Quand l'entrée est invalide, alors « Entrée invalide »", async () => {
    expect(await markPrintedAction({ unitIds: [""] })).toEqual({ ok: false, error: "Entrée invalide" });
  });
  it("Quand des unités sont données, alors elles sont marquées imprimées", async () => {
    expect(await markPrintedAction({ unitIds: ["U1", "U2"] })).toEqual({ ok: true, units: UNITS });
    expect(db.unit.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["U1", "U2"] } }, data: { etiquetteImprimee: true },
    });
  });
});
