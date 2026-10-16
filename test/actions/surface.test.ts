import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));
// #3 : chaque action passe par withAccess → getActor ; session et en-têtes bouchonnés.
vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

import * as actions from "@/app/actions";

describe("surface de @/app/actions — figée avant le découpage (#2)", () => {
  it("Quand on liste les exports, alors ce sont exactement les 15 actions (14 de #2 + retestUnitOfficeAction, #3), et ni fail ni recordOperation", () => {
    expect(Object.keys(actions).sort()).toEqual([
      "closeDeliveryAction", "confirmMontageAction", "confirmMontageBulkAction",
      "confirmTestAction", "confirmVerifAction", "createBatchAction", "createDeliveryAction",
      "getLiveDataAction", "markPrintedAction", "packUnitAction", "retestUnitAction",
      // #3 (Q1, décision de Gedeon) : remise en essai du Bureau, signée par la session.
      "retestUnitOfficeAction",
      "saveSettingsAction", "saveTemplateAction", "updateBatchAction",
    ].sort());
  });
  it("Quand on regarde chaque export, alors c'est une fonction async", () => {
    for (const fn of Object.values(actions)) {
      expect(typeof fn).toBe("function");
      expect((fn as () => unknown).constructor.name).toBe("AsyncFunction");
    }
  });
});
