import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Module rechargé à chaque test : l'avertissement est « une fois par démarrage ».
const load = async () => (await import("@/lib/access/flag")).floorEnforced;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetModules();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockRestore();
});

describe("floorEnforced — Étant donné la variable serveur ACCESS_ENFORCE_FLOOR (#5)", () => {
  it("Quand elle vaut exactement « true », alors la garde est active, sans avertissement", async () => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true");
    expect((await load())()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["TRUE", "True", "1", "yes", " true", "true ", ""])("Quand elle vaut « %s », alors la garde est inactive", async (v) => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", v);
    expect((await load())()).toBe(false);
  });

  it("Quand elle est absente, alors inactive, et un seul avertissement serveur par démarrage", async () => {
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", undefined as unknown as string);
    const floorEnforced = await load();
    expect(floorEnforced()).toBe(false);
    expect(floorEnforced()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("ACCESS_ENFORCE_FLOOR");
  });

  it("Quand elle change sans redémarrage, alors la nouvelle valeur est lue (pas de constante figée)", async () => {
    const floorEnforced = await load();
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "true");
    expect(floorEnforced()).toBe(true);
    vi.stubEnv("ACCESS_ENFORCE_FLOOR", "false");
    expect(floorEnforced()).toBe(false);
  });

  it("Quand on cherche la variable dans le code client, alors elle n'apparaît que dans le module serveur", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(p);
      }
    };
    walk("src");
    const hits = files.filter((p) => readFileSync(p, "utf8").includes("ACCESS_ENFORCE_FLOOR"));
    expect(hits.map((p) => p.replaceAll("\\", "/"))).toEqual(["src/lib/access/flag.ts"]);
    expect(readFileSync("src/lib/access/flag.ts", "utf8")).toMatch(/^import "server-only";/m);
  });
});
