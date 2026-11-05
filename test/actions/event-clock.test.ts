import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));

import { dbNow, pairTimestamps } from "@/app/actions/_shared";

/** #19 (T1, non-bloquant i) : l'heure du couple fail/rework vient de la base, pas de Node. */
describe("dbNow — Étant donné un client de transaction (#19)", () => {
  const T = new Date("2026-10-20T10:00:00.123Z");
  it("Quand on lit l'heure, alors clock_timestamp() est émise et sa valeur est rendue", async () => {
    const $queryRaw = vi.fn(async () => [{ t: T }]);
    expect(await dbNow({ $queryRaw } as never)).toEqual(T);
    const [sql] = $queryRaw.mock.calls[0] as unknown as [TemplateStringsArray];
    expect(sql.join("?")).toContain("SELECT clock_timestamp()");
  });
  it("Quand le pilote rend une chaîne, alors elle est convertie en Date", async () => {
    const $queryRaw = vi.fn(async () => [{ t: T.toISOString() }]);
    expect(await dbNow({ $queryRaw } as never)).toEqual(T);
  });
  it("Quand la base ne rend aucune heure valide, alors l'erreur remonte (pas de repli sur l'horloge Node)", async () => {
    await expect(dbNow({ $queryRaw: vi.fn(async () => []) } as never)).rejects.toThrow("clock_timestamp");
    await expect(dbNow({ $queryRaw: vi.fn(async () => [{ t: "pas une date" }]) } as never)).rejects.toThrow("clock_timestamp");
  });
});

describe("pairTimestamps — Étant donné l'heure t lue en base (#19)", () => {
  it("Quand on horodate le couple, alors fail = t et rework = t + 1 ms", () => {
    const t = new Date("2026-10-20T10:00:00.000Z");
    const { failAt, reworkAt } = pairTimestamps(t);
    expect(failAt).toEqual(t);
    expect(reworkAt.getTime() - t.getTime()).toBe(1);
    expect(failAt).not.toBe(t); // copie : l'appelant ne partage pas l'objet
  });
});
