import { describe, it, expect, vi, afterEach } from "vitest";
import { checkPhotoFile, photoExtOf, isPhotoPathFor, putPhoto, PHOTO_MAX_BYTES, PHOTO_EXTS } from "@/lib/photo";

afterEach(() => vi.unstubAllGlobals());

describe("règles de la photo de défaut (#23)", () => {
  it("Quand le fichier est un JPEG de 5 Mo pile, alors accepté ; 1 octet de plus, alors trop lourd", () => {
    expect(checkPhotoFile({ type: "image/jpeg", size: PHOTO_MAX_BYTES })).toBe("ok");
    expect(checkPhotoFile({ type: "image/jpeg", size: PHOTO_MAX_BYTES + 1 })).toBe("size");
  });
  it.each(["image/png", "image/webp", "image/heic"])("Quand le type est %s, alors accepté", (type) => {
    expect(checkPhotoFile({ type, size: 10 })).toBe("ok");
  });
  it.each(["image/gif", "application/pdf", "", "toString"])("Quand le type est « %s », alors refusé", (type) => {
    expect(checkPhotoFile({ type, size: 10 })).toBe("type");
    expect(photoExtOf(type)).toBeNull();
  });
  it("Quand on demande l'extension, alors elle suit le type", () => {
    expect(photoExtOf("image/jpeg")).toBe("jpg");
    expect(PHOTO_EXTS).toEqual(["jpg", "png", "webp", "heic"]);
  });

  it("Quand le chemin a le préfixe de l'unité, alors il lui appartient", () => {
    expect(isPhotoPathFor("U1", "units/U1/abc-123.jpg")).toBe(true);
    expect(isPhotoPathFor("U1", "units/U1/x_y.heic")).toBe(true);
  });
  it.each([
    ["autre unité", "U1", "units/U2/a.jpg"],
    ["préfixe partiel", "U1", "units/U10/a.jpg"],
    ["remontée de dossier", "U1", "units/U1/../U2/a.jpg"],
    ["sous-dossier", "U1", "units/U1/sub/a.jpg"],
    ["extension refusée", "U1", "units/U1/a.gif"],
    ["sans préfixe", "U1", "a.jpg"],
    ["unitId hors motif", "U1/../U2", "units/U1/../U2/a.jpg"],
  ])("Quand %s, alors refusé", (_, unitId, path) => {
    expect(isPhotoPathFor(unitId, path)).toBe(false);
  });
});

describe("putPhoto — envoi direct à l'URL signée (#23)", () => {
  const file = new Blob(["x"], { type: "image/png" });
  it("Quand le bucket répond 200, alors true, avec un PUT binaire typé", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await putPhoto("http://127.0.0.1:54399/u?token=t", file)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:54399/u?token=t", expect.objectContaining({
      method: "PUT", body: file, headers: expect.objectContaining({ "content-type": "image/png", "x-upsert": "false" }),
    }));
  });
  it("Quand le bucket refuse (413), alors false et le statut au journal", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 413 })));
    expect(await putPhoto("http://127.0.0.1:1/u", file)).toBe(false);
  });
  it("Quand le réseau tombe, alors false sans lever", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    expect(await putPhoto("http://127.0.0.1:1/u", file)).toBe(false);
  });
});
