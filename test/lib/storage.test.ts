import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Client Supabase bouchonné : aucun appel réseau (GUARDRAILS §12).
const files = { createSignedUploadUrl: vi.fn(), exists: vi.fn(), createSignedUrl: vi.fn() };
const from = vi.fn(() => files);
const createClient = vi.fn((...args: unknown[]) => ({ storage: { from }, args }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createClient(...a) }));

import { photoStorage } from "@/lib/storage";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54399");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "cle-factice");
  vi.stubEnv("SUPABASE_PHOTO_BUCKET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("photoStorage — accès serveur au bucket privé (#23)", () => {
  it.each(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])("Quand %s manque, alors null et aucun client", (k) => {
    vi.stubEnv(k, "");
    expect(photoStorage()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
  it("Quand tout est configuré, alors client à clé de service sur le bucket nc-photos par défaut", () => {
    photoStorage();
    expect(createClient).toHaveBeenCalledWith("http://127.0.0.1:54399", "cle-factice", { auth: { persistSession: false } });
    expect(from).toHaveBeenCalledWith("nc-photos");
  });
  it("Quand SUPABASE_PHOTO_BUCKET est posé, alors ce bucket", () => {
    vi.stubEnv("SUPABASE_PHOTO_BUCKET", "nc-photos-staging");
    photoStorage();
    expect(from).toHaveBeenCalledWith("nc-photos-staging");
  });
  it("Quand on signe un envoi, une lecture ou teste l'existence, alors la réponse du bucket", async () => {
    files.createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: "http://x/up?token=t", token: "t" }, error: null });
    files.exists.mockResolvedValue({ data: true, error: null });
    files.createSignedUrl.mockResolvedValue({ data: { signedUrl: "http://x/read?token=r" }, error: null });
    const s = photoStorage()!;
    expect(await s.signUpload("units/U1/a.jpg")).toBe("http://x/up?token=t");
    expect(await s.exists("units/U1/a.jpg")).toBe(true);
    expect(await s.signRead("units/U1/a.jpg", 600)).toBe("http://x/read?token=r");
    expect(files.createSignedUrl).toHaveBeenCalledWith("units/U1/a.jpg", 600);
  });
  it("Quand le bucket rend une erreur, alors elle est levée (jamais avalée)", async () => {
    const error = new Error("bucket");
    files.createSignedUploadUrl.mockResolvedValue({ data: null, error });
    files.createSignedUrl.mockResolvedValue({ data: null, error });
    const s = photoStorage()!;
    await expect(s.signUpload("p")).rejects.toBe(error);
    await expect(s.signRead("p", 1)).rejects.toBe(error);
  });
});

describe("photoStorage.exists — contrat de storage-js 2.108 (#23)", () => {
  it("Quand le fichier est absent (404 → data false + error), alors false, pas d'exception", async () => {
    files.exists.mockResolvedValue({ data: false, error: new Error("404") });
    expect(await photoStorage()!.exists("units/U1/a.jpg")).toBe(false);
  });
  it("Quand storage-js lève (5xx, réseau), alors l'erreur remonte", async () => {
    const error = new Error("503");
    files.exists.mockRejectedValue(error);
    await expect(photoStorage()!.exists("p")).rejects.toBe(error);
  });
});
