import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));
vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));
// Stockage bouchonné : aucun appel à Supabase (GUARDRAILS §12).
const storage = { signUpload: vi.fn(), exists: vi.fn(), signRead: vi.fn() };
const photoStorage = vi.fn((): typeof storage | null => storage);
vi.mock("@/lib/storage", () => ({ photoStorage: () => photoStorage() }));

import { prisma } from "@/lib/db";
import { resetDbMock, type PrismaMock } from "../mocks/db";
import { setSession } from "../mocks/auth";
import { cookies, resetHeadersMock } from "../mocks/headers";
import { kioskCookieName } from "@/lib/access/kiosk";
import { PROFILES } from "../access/profiles";
import { createDefectPhotoUploadAction, getDefectPhotoUrlAction } from "@/app/actions";
import { getDefectPhotoUrl } from "@/app/actions/_photos";

const db = prisma as unknown as PrismaMock;
const PHOTO = "units/U1/1f0e.jpg";

async function onKiosk() {
  (await cookies()).set(kioskCookieName(), "jeton-k7");
  db.kiosk.findUnique.mockResolvedValue({ id: "k7", label: "Établi 7", revokedAt: null, lastSeenAt: new Date() });
}

beforeEach(() => {
  resetDbMock();
  resetHeadersMock();
  vi.clearAllMocks();
  photoStorage.mockImplementation(() => storage);
  vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true");
  setSession(null);
  storage.signUpload.mockResolvedValue("http://127.0.0.1:54399/storage/v1/object/upload/sign/nc-photos/x?token=t");
  storage.signRead.mockResolvedValue("http://127.0.0.1:54399/storage/v1/object/sign/nc-photos/x?token=r");
  db.traceEvent.findUnique.mockResolvedValue({ unitId: "U1", data: { visual: "refus", photo: PHOTO } });
  db.unit.findUnique.mockResolvedValue({ id: "U1" });
});

describe("getDefectPhotoUrlAction — matrice d'accès (#23, B5)", () => {
  it("Quand un client sans écran demande la photo, alors FORBIDDEN, sans lecture ni URL", async () => {
    setSession(PROFILES.client.session);
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E1" })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(db.traceEvent.findUnique).not.toHaveBeenCalled();
    expect(storage.signRead).not.toHaveBeenCalled();
  });
  it("Quand un client connecté sur un écran appairé demande la photo, alors refus, sans URL", async () => {
    setSession(PROFILES.client.session);
    await onKiosk();
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E1" })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(storage.signRead).not.toHaveBeenCalled();
  });
  it("Quand un écran appairé sans compte demande la photo, alors refus (STAFF_WRITE), sans URL", async () => {
    await onKiosk();
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E1" })).toEqual({ ok: false, error: "AUTH_REQUIRED" });
    expect(storage.signRead).not.toHaveBeenCalled();
  });
  it("Quand un anonyme demande la photo, drapeau éteint, alors refus quand même", async () => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "false");
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E1" })).toEqual({ ok: false, error: "AUTH_REQUIRED" });
  });
  it.each(["superviseur", "admin"] as const)("Quand %s demande la photo, alors une URL signée de 10 min", async (p) => {
    setSession(PROFILES[p].session);
    const res = await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E1" });
    expect(res).toEqual({ ok: true, photoUrl: expect.stringContaining("token=r") });
    expect(db.traceEvent.findUnique).toHaveBeenCalledWith({ where: { id: "E1" }, select: { unitId: true, data: true } });
    expect(storage.signRead).toHaveBeenCalledWith(PHOTO, 600);
  });
  it("Défense en profondeur : le handler refuse un client même si la garde l'a laissé passer (écran)", async () => {
    const actor = { ...PROFILES.client.actor, kiosk: { id: "k7", label: "Établi 7" } };
    expect(await getDefectPhotoUrl({ unitId: "U1", eventId: "E1" }, actor)).toEqual({ ok: false, error: "PHOTO_FORBIDDEN" });
    expect(db.traceEvent.findUnique).not.toHaveBeenCalled();
  });
  it("Défense en profondeur : le handler refuse un écran sans compte", async () => {
    const actor = { ...PROFILES.anonyme.actor, kiosk: { id: "k7", label: "Établi 7" } };
    expect(await getDefectPhotoUrl({ unitId: "U1", eventId: "E1" }, actor)).toEqual({ ok: false, error: "PHOTO_FORBIDDEN" });
  });
});

describe("getDefectPhotoUrlAction — propriété de l'événement (#23)", () => {
  beforeEach(() => setSession(PROFILES.superviseur.session));
  const notFound = { ok: false, error: "PHOTO_NOT_FOUND" };
  it("Quand l'événement appartient à une autre unité, alors refus, sans URL", async () => {
    db.traceEvent.findUnique.mockResolvedValue({ unitId: "U2", data: { photo: "units/U2/a.jpg" } });
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E-U2" })).toEqual(notFound);
    expect(storage.signRead).not.toHaveBeenCalled();
  });
  it("Quand l'événement d'une autre unité porte un chemin sous le préfixe demandé, alors refus (propriété vérifiée seule)", async () => {
    db.traceEvent.findUnique.mockResolvedValue({ unitId: "U2", data: { photo: PHOTO } });
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E-U2" })).toEqual(notFound);
    expect(storage.signRead).not.toHaveBeenCalled();
  });
  it("Quand l'événement de l'unité porte le chemin d'une autre unité, alors refus, sans URL", async () => {
    db.traceEvent.findUnique.mockResolvedValue({ unitId: "U1", data: { photo: "units/U2/a.jpg" } });
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E1" })).toEqual(notFound);
    expect(storage.signRead).not.toHaveBeenCalled();
  });
  it.each([
    ["inexistant", null],
    ["sans data", { unitId: "U1", data: null }],
    ["sans photo", { unitId: "U1", data: { visual: "refus" } }],
    ["photo non textuelle", { unitId: "U1", data: { photo: 42 } }],
  ])("Quand l'événement est %s, alors PHOTO_NOT_FOUND", async (_, row) => {
    db.traceEvent.findUnique.mockResolvedValue(row);
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E1" })).toEqual(notFound);
  });
  it("Quand l'entrée est invalide, alors message Zod, sans lecture", async () => {
    expect((await getDefectPhotoUrlAction({ unitId: "U1" })).ok).toBe(false);
    expect(db.traceEvent.findUnique).not.toHaveBeenCalled();
  });
  it("Quand le stockage n'est pas configuré, alors PHOTO_UNAVAILABLE", async () => {
    photoStorage.mockImplementation(() => null);
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E1" })).toEqual({ ok: false, error: "PHOTO_UNAVAILABLE" });
  });
  it("Quand le bucket échoue, alors GENERIC (détail au journal serveur seulement)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    storage.signRead.mockRejectedValue(new Error("secret interne"));
    expect(await getDefectPhotoUrlAction({ unitId: "U1", eventId: "E1" })).toEqual({ ok: false, error: "GENERIC" });
  });
});

describe("createDefectPhotoUploadAction — envoi depuis l'atelier (#23)", () => {
  it("Quand un écran appairé demande l'envoi, alors un chemin imposé sous units/{unitId}/ et l'URL signée", async () => {
    await onKiosk();
    const res = await createDefectPhotoUploadAction({ unitId: "U1", type: "image/heic" });
    expect(res.ok).toBe(true);
    expect(res.upload!.path).toMatch(/^units\/U1\/[0-9a-f-]{36}\.heic$/);
    expect(res.upload!.url).toContain("token=t");
    expect(storage.signUpload).toHaveBeenCalledWith(res.upload!.path);
  });
  it("Quand un superviseur demande l'envoi, alors accepté", async () => {
    setSession(PROFILES.superviseur.session);
    expect((await createDefectPhotoUploadAction({ unitId: "U1", type: "image/jpeg" })).upload!.path).toMatch(/\.jpg$/);
  });
  it.each(["anonyme", "client"] as const)("Quand %s sans écran demande l'envoi, alors refus, sans signature", async (p) => {
    setSession(PROFILES[p].session);
    expect((await createDefectPhotoUploadAction({ unitId: "U1", type: "image/jpeg" })).ok).toBe(false);
    expect(storage.signUpload).not.toHaveBeenCalled();
  });
  it("Quand l'écran est révoqué, alors KIOSK_REVOKED", async () => {
    (await cookies()).set(kioskCookieName(), "jeton-k7");
    db.kiosk.findUnique.mockResolvedValue({ id: "k7", label: "Établi 7", revokedAt: new Date(), lastSeenAt: new Date() });
    expect(await createDefectPhotoUploadAction({ unitId: "U1", type: "image/jpeg" })).toEqual({ ok: false, error: "KIOSK_REVOKED" });
  });
  it.each(["image/gif", "application/pdf", ""])("Quand le type est « %s », alors refusé, sans signature", async (type) => {
    await onKiosk();
    expect((await createDefectPhotoUploadAction({ unitId: "U1", type })).ok).toBe(false);
    expect(storage.signUpload).not.toHaveBeenCalled();
  });
  it("Quand l'unité n'existe pas, alors refus, sans signature", async () => {
    await onKiosk();
    db.unit.findUnique.mockResolvedValue(null);
    expect(await createDefectPhotoUploadAction({ unitId: "U9", type: "image/png" })).toEqual({ ok: false, error: "Unité introuvable" });
    expect(storage.signUpload).not.toHaveBeenCalled();
  });
  it("Quand l'unitId contient un séparateur de chemin, alors PHOTO_PATH_INVALID, sans signature", async () => {
    await onKiosk();
    db.unit.findUnique.mockResolvedValue({ id: "U1/../U2" });
    expect(await createDefectPhotoUploadAction({ unitId: "U1/../U2", type: "image/png" })).toEqual({ ok: false, error: "PHOTO_PATH_INVALID" });
    expect(storage.signUpload).not.toHaveBeenCalled();
  });
  it("Quand le stockage n'est pas configuré, alors PHOTO_UNAVAILABLE, sans lecture de base", async () => {
    await onKiosk();
    photoStorage.mockImplementation(() => null);
    db.unit.findUnique.mockClear();
    expect(await createDefectPhotoUploadAction({ unitId: "U1", type: "image/png" })).toEqual({ ok: false, error: "PHOTO_UNAVAILABLE" });
    expect(db.unit.findUnique).not.toHaveBeenCalled();
  });
});
