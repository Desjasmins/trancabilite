import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));

import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "../mocks/db";
import { resetQueriesMock, UNITS, BATCHES, DELIVERIES, SETTINGS, TEMPLATE } from "./queries-mock";
import {
  createDeliveryAction, closeDeliveryAction, saveSettingsAction, saveTemplateAction, getLiveDataAction,
} from "@/app/actions";

const db = prisma as unknown as PrismaMock;
beforeEach(() => { resetDbMock(); resetQueriesMock(); });

describe("livraisons — figé (#2)", () => {
  it("Quand l'id manque, alors « ID requis »", async () => {
    expect(await createDeliveryAction({ id: "" })).toEqual({ ok: false, error: "ID requis" });
  });
  it("Quand la livraison n'existe pas, alors elle est créée ouverte", async () => {
    db.delivery.findUnique.mockResolvedValue(null);
    expect(await createDeliveryAction({ id: "L1", client: "" })).toEqual({ ok: true, deliveries: DELIVERIES });
    expect(db.delivery.findUnique).toHaveBeenCalledWith({ where: { id: "L1" } });
    expect(db.delivery.create).toHaveBeenCalledWith({ data: { id: "L1", client: null, closed: false } });
  });
  it("Quand elle existe, alors rien n'est créé", async () => {
    db.delivery.findUnique.mockResolvedValue({ id: "L1" });
    expect(await createDeliveryAction({ id: "L1", client: "C" })).toEqual({ ok: true, deliveries: DELIVERIES });
    expect(db.delivery.create).not.toHaveBeenCalled();
  });
  it("Quand on ferme, alors closed=true ; entrée invalide → échec", async () => {
    expect((await closeDeliveryAction({ id: "" })).ok).toBe(false);
    expect(await closeDeliveryAction({ id: "L1" })).toEqual({ ok: true, deliveries: DELIVERIES });
    expect(db.delivery.update).toHaveBeenCalledWith({ where: { id: "L1" }, data: { closed: true } });
  });
});

describe("réglages et gabarit — figé (#2)", () => {
  it("Quand les réglages sont invalides, alors échec sans transaction", async () => {
    expect((await saveSettingsAction({ sub: "", proj: "", ops: [""] })).ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("Quand on enregistre, alors upsert, purge des opérateurs puis recréation ordonnée, en une transaction", async () => {
    db.settings.upsert.mockReturnValue("U");
    db.operator.deleteMany.mockReturnValue("D");
    db.operator.create.mockImplementation((a: unknown) => a);
    expect(await saveSettingsAction({ sub: "S", proj: "P", ops: ["A", "B"] })).toEqual({ ok: true, settings: SETTINGS });
    expect(db.settings.upsert).toHaveBeenCalledWith({
      where: { id: 1 }, create: { id: 1, sub: "S", proj: "P" }, update: { sub: "S", proj: "P" },
    });
    expect(db.operator.deleteMany).toHaveBeenCalledWith({});
    expect(db.$transaction).toHaveBeenCalledWith([
      "U", "D",
      { data: { name: "A", order: 0, active: true } },
      { data: { name: "B", order: 1, active: true } },
    ]);
  });
  const el = { show: true, text: "", x: 0, y: 0, font: 8, bold: false, family: "" };
  const tpl = {
    presetId: "p", w: 50, h: 25, font: "sans", code: { type: "qr", x: 0, y: 0, size: 10 },
    elements: { header: el, po: el, modele: el, serie: el, sub: el, date: el, iso: el },
    print: { method: "dialog", dpi: 203 },
  };
  it("Quand le gabarit est invalide, alors « Gabarit invalide » ou message Zod", async () => {
    const r = await saveTemplateAction({ ...tpl, w: -1 });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(db.labelTemplate.upsert).not.toHaveBeenCalled();
  });
  it("Quand le gabarit est valide, alors upsert id 1 et gabarit rechargé", async () => {
    expect(await saveTemplateAction(tpl)).toEqual({ ok: true, template: TEMPLATE });
    expect(db.labelTemplate.upsert).toHaveBeenCalledWith({
      where: { id: 1 }, create: { id: 1, data: tpl }, update: { data: tpl },
    });
  });
});

describe("getLiveDataAction — figé (#2)", () => {
  it("Quand on recharge, alors unités, lots et livraisons", async () => {
    expect(await getLiveDataAction()).toEqual({ ok: true, units: UNITS, batches: BATCHES, deliveries: DELIVERIES });
  });
});
