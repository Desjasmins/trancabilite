import "server-only";
import { prisma } from "./db";
import { toUnitDTO, toDeliveryDTO, toOperationDTO, toRouteDTO } from "./mappers";
import { defaultTemplate, normalizeTemplate } from "./label";
import type {
  Snapshot,
  UnitDTO,
  DeliveryDTO,
  SettingsDTO,
  LabelTemplate,
  OperationDTO,
  RouteDTO,
} from "./types";

export async function loadUnits(): Promise<UnitDTO[]> {
  const rows = await prisma.unit.findMany({
    include: { events: true },
    orderBy: { dateCreation: "asc" },
  });
  return rows.map(toUnitDTO);
}

export async function loadDeliveries(): Promise<DeliveryDTO[]> {
  const rows = await prisma.delivery.findMany({ orderBy: { id: "asc" } });
  return rows.map(toDeliveryDTO);
}

export async function loadSettings(): Promise<SettingsDTO> {
  const [s, ops] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.operator.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);
  return {
    sub: s?.sub ?? "",
    proj: s?.proj ?? "",
    ops: ops.map((o) => o.name),
  };
}

export async function loadTemplate(): Promise<LabelTemplate> {
  const row = await prisma.labelTemplate.findUnique({ where: { id: 1 } });
  if (!row) return defaultTemplate();
  return normalizeTemplate(row.data as unknown as LabelTemplate);
}

export async function loadOperations(): Promise<OperationDTO[]> {
  const rows = await prisma.operation.findMany();
  return rows.map(toOperationDTO);
}

export async function loadRoutes(): Promise<RouteDTO[]> {
  const rows = await prisma.route.findMany({ include: { steps: true }, orderBy: { name: "asc" } });
  return rows.map(toRouteDTO);
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [units, deliveries, settings, template, operations, routes] = await Promise.all([
    loadUnits(),
    loadDeliveries(),
    loadSettings(),
    loadTemplate(),
    loadOperations(),
    loadRoutes(),
  ]);
  return { units, deliveries, settings, template, operations, routes };
}
