import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => import("../mocks/db"));
vi.mock("@/lib/queries", () => import("./queries-mock"));
vi.mock("next/headers", () => import("../mocks/headers"));
vi.mock("@/lib/auth", () => import("../mocks/auth"));

import * as actions from "@/app/actions";
import { POLICIES } from "@/app/actions/policies";

describe("POLICIES — Étant donné le tableau unique des politiques (défaut fermé)", () => {
  it("Quand on compare aux exports de @/app/actions, alors chaque action y figure, et rien de plus", () => {
    expect(Object.keys(POLICIES).sort()).toEqual(Object.keys(actions).sort());
  });

  it("Quand on liste STAFF_WRITE, alors exactement les quatre écritures du Bureau", () => {
    const staff = Object.entries(POLICIES).filter(([, p]) => p === "STAFF_WRITE").map(([n]) => n).sort();
    expect(staff).toEqual([
      "retestUnitOfficeAction", "saveSettingsAction", "saveTemplateAction", "updateBatchAction",
    ]);
  });

  it("Quand on liste le reste, alors c'est OPEN_UNTIL_KIOSK, nommé comme temporaire", () => {
    const others = Object.entries(POLICIES).filter(([, p]) => p !== "STAFF_WRITE");
    expect(others).toHaveLength(11);
    for (const [, p] of others) expect(p).toBe("OPEN_UNTIL_KIOSK");
  });
});
