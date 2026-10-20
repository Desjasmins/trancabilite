import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));
vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

import * as actions from "@/app/actions";
import { POLICIES, type ActionName } from "@/app/actions/policies";
import { allowed } from "@/lib/access/policy";
import { prisma } from "@/lib/db";
import { resetDbMock, MODEL_DELEGATES, type PrismaMock } from "../mocks/db";
import { setSession } from "../mocks/auth";
import * as queries from "./queries-mock";
import { PROFILES, PROFILE_NAMES } from "../access/profiles";

const db = prisma as unknown as PrismaMock;
type Fn = (input?: unknown) => Promise<{ ok: boolean; error?: string }>;

function prismaCalls(): number {
  let n = db.$transaction.mock.calls.length;
  for (const m of MODEL_DELEGATES) for (const fn of Object.values(db[m])) n += fn.mock.calls.length;
  return n;
}
function loaderCalls(): number {
  return [queries.loadUnits, queries.loadBatches, queries.loadDeliveries, queries.loadSettings, queries.loadTemplate]
    .reduce((n, fn) => n + fn.mock.calls.length, 0);
}

beforeEach(() => { resetDbMock(); queries.resetQueriesMock(); });
afterEach(() => vi.unstubAllEnvs());

// Chaque action × chaque profil × drapeau : le résultat de la garde = allowed(POLICIES[name], acteur, drapeau).
describe("garde des Server Actions — Étant donné chaque action et chaque profil", () => {
  for (const flag of ["true", "false"] as const) {
    for (const name of Object.keys(POLICIES) as ActionName[]) {
      it.each(PROFILE_NAMES)(`Quand %s appelle ${name} (ACCESS_ENFORCE_FLOOR=${flag}), alors la garde suit allowed`, async (profile) => {
        vi.stubEnv("ACCESS_ENFORCE_FLOOR", flag);
        vi.spyOn(console, "warn").mockImplementation(() => {});
        setSession(PROFILES[profile].session);
        const actor = PROFILES[profile].actor;
        const expectedOk = allowed(POLICIES[name], actor, flag === "true");
        // Entrée vide : un appel autorisé s'arrête à Zod (ou lit les données), un refusé n'atteint rien.
        const res = await (actions[name] as Fn)({});
        if (expectedOk) {
          expect(res.error === "AUTH_REQUIRED" || res.error === "FORBIDDEN").toBe(false);
        } else {
          // Le banni a une session : FORBIDDEN (#5).
          const code = actor.user || actor.banned ? "FORBIDDEN" : "AUTH_REQUIRED";
          expect(res).toEqual({ ok: false, error: code });
          expect(prismaCalls()).toBe(0);
          expect(loaderCalls()).toBe(0);
        }
      });
    }
  }

  it("(régression : faille du 2026-10-16) Quand un anonyme appelle saveSettingsAction avec une entrée valide, alors aucun deleteMany", async () => {
    setSession(null);
    const res = await actions.saveSettingsAction({ sub: "S", proj: "P", ops: ["A"] });
    expect(res).toEqual({ ok: false, error: "AUTH_REQUIRED" });
    expect(db.operator.deleteMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
