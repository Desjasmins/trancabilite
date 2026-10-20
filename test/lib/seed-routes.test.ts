// Invariant du seed (#20) : routeLacksTest est cohérent avec les gammes semées.
import { describe, it, expect, vi } from "vitest";
import { routeLacksTest } from "@/lib/process";

type RouteData = { name: string; steps: { create: { operationKey: string; position: number }[] } };
const routes: RouteData[] = [];

vi.mock("dotenv/config", () => ({}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("../../src/generated/prisma/client", () => {
  const model = (name: string) => ({
    deleteMany: async () => ({}),
    createMany: async () => ({}),
    upsert: async () => ({}),
    create: async ({ data }: { data: RouteData }) => {
      if (name === "route") routes.push(data);
      return {};
    },
  });
  class PrismaClient {
    constructor() {
      return new Proxy({ $disconnect: async () => {} } as Record<string, unknown>, {
        get: (target, key: string) => (key in target ? target[key] : model(key)),
      });
    }
  }
  return { PrismaClient, OperationKind: { STANDARD: "STANDARD", QC: "QC" } };
});

describe("Seed — Étant donné les gammes semées", () => {
  it("Quand on lit chaque gamme, alors seule « Sans test » est signalée sans poste Test", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await import("../../prisma/seed");
    await vi.waitFor(() => expect(routes).toHaveLength(2));
    const lacks = Object.fromEntries(
      routes.map((r) => [
        r.name,
        routeLacksTest([...r.steps.create].sort((a, b) => a.position - b.position).map((s) => s.operationKey)),
      ]),
    );
    expect(lacks).toEqual({ Standard: false, "Sans test": true });
  });
});
