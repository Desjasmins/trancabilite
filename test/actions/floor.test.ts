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
  // #3 : aucune session — l'atelier reste ouvert (OPEN_UNTIL_KIOSK), y compris pour un anonyme.
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
      data: { diel: "accept", pol: "accept", eff: "accept" }, note: null, stationId: null,
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
  it("Quand l'erreur n'est pas une Error, alors GENERIC (D15, #3)", async () => {
    db.unit.findUnique.mockRejectedValue(1);
    expect(await confirmTestAction(base)).toEqual({ ok: false, error: "GENERIC" });
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
    ["confirmTestAction", () => confirmTestAction({ unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "refus", nc: "x" }), "test"],
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
    ["confirmTestAction", () => confirmTestAction({ unitId: "U1", operator: "Ana", diel: "accept", pol: "accept", eff: "accept", nc: "", ...forge }), unitRow({ currentOperationKey: "test" }), () => {}],
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
