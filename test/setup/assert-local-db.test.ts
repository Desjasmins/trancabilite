import { describe, it, expect } from "vitest";
import { assertLocalDatabase } from "./assert-local-db";

describe("garde-fou base — Étant donné les URL de base de l'environnement de test", () => {
  it("Quand aucune URL n'est définie, alors les tests tournent", () => {
    expect(() => assertLocalDatabase({})).not.toThrow();
  });
  it("Quand DATABASE_URL vise 127.0.0.1 ou localhost, alors les tests tournent", () => {
    expect(() => assertLocalDatabase({ DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test" })).not.toThrow();
    expect(() => assertLocalDatabase({ DIRECT_URL: "postgresql://u:p@localhost:5432/db" })).not.toThrow();
  });
  it("Quand DATABASE_URL vise un hôte distant, alors les tests refusent de tourner", () => {
    expect(() => assertLocalDatabase({ DATABASE_URL: "postgresql://u:p@service.invalid:6543/db" })).toThrow(/DATABASE_URL vise « service.invalid »/);
  });
  it("Quand DIRECT_URL vise un hôte distant (DATABASE_URL locale), alors les tests refusent de tourner", () => {
    expect(() =>
      assertLocalDatabase({ DATABASE_URL: "postgresql://u:p@127.0.0.1:1/t", DIRECT_URL: "postgresql://u:p@192.0.2.1:5432/db" }),
    ).toThrow(/DIRECT_URL/);
  });
  it("Quand une URL est illisible, alors les tests refusent de tourner", () => {
    expect(() => assertLocalDatabase({ DATABASE_URL: "pas une url" })).toThrow(/illisible/);
  });
});
