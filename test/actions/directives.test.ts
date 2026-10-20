import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Frontière serveur (doc Next 16, use-server.md) : avec "use server", chaque export devient
// appelable depuis le client. recordOperation (_shared) ne doit donc JAMAIS porter la directive.
const dir = fileURLToPath(new URL("../../src/app/actions/", import.meta.url));
const src = (name: string) => readFileSync(`${dir}${name}.ts`, "utf8");

describe("directives des modules d'actions (#2)", () => {
  it.each(["batches", "floor", "deliveries", "settings", "live"])(
    "Quand on lit %s.ts, alors \"use server\" est en ligne 1",
    (name) => {
      expect(src(name).split("\n")[0]).toBe('"use server";');
    },
  );
  it.each(["_shared", "index"])("Quand on lit %s.ts, alors \"use server\" est absent", (name) => {
    // Directive = instruction seule sur sa ligne ; les commentaires qui la citent ne comptent pas.
    expect(src(name)).not.toMatch(/^\s*["']use server["'];?\s*$/m);
  });
  it("Quand on lit _shared.ts, alors il importe server-only", () => {
    expect(src("_shared")).toMatch(/^import "server-only";$/m);
  });
});
