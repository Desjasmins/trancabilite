import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));

import * as actions from "@/app/actions";

describe("surface de @/app/actions — figée avant le découpage (#2)", () => {
  it("Quand on liste les exports, alors ce sont exactement les 14 actions de la branche, et ni fail ni recordOperation", () => {
    expect(Object.keys(actions).sort()).toEqual([
      "closeDeliveryAction", "confirmMontageAction", "confirmMontageBulkAction",
      "confirmTestAction", "confirmVerifAction", "createBatchAction", "createDeliveryAction",
      "getLiveDataAction", "markPrintedAction", "packUnitAction", "retestUnitAction",
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
