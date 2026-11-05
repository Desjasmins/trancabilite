import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));

import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "../mocks/db";
import { loadUnits } from "@/lib/queries";

const db = prisma as unknown as PrismaMock;

beforeEach(() => resetDbMock());

describe("loadUnits — Étant donné le journal et la table des écrans (#4)", () => {
  it("Quand un événement porte un écran, alors l'unité affiche son libellé ; les écrans sont lus une seule fois", async () => {
    db.unit.findMany.mockResolvedValue([{
      id: "U1", serie: "001", projet: "P", reference: "R", po: null, dessin: null, sub: null, batchId: null,
      deliveryId: null, dateCreation: new Date("2026-10-01T00:00:00Z"), etiquettePar: null, etiquetteDate: null,
      etiquetteImprimee: false, nc: null, currentOperationKey: "test", blocked: false, version: 1,
      events: [{ operationKey: "montage", result: "done", operator: "Ana", stationId: "k1", data: null, createdAt: new Date("2026-10-02T00:00:00Z") }],
    }]);
    db.kiosk.findMany.mockResolvedValue([{ id: "k1", label: "Établi 2" }]);
    const [u] = await loadUnits();
    expect(u.montage).toEqual({ par: "Ana", date: "2026-10-02T00:00:00.000Z", ecran: "Établi 2" });
    expect(db.kiosk.findMany).toHaveBeenCalledTimes(1);
    expect(db.kiosk.findMany).toHaveBeenCalledWith({ select: { id: true, label: true } });
    expect(db.unit.findMany).toHaveBeenCalledWith({
      include: { events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, orderBy: { dateCreation: "asc" },
    });
  });
});
