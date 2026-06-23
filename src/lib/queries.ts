import "server-only";
import { prisma } from "./db";
import { toUnitDTO, toDeliveryDTO } from "./mappers";
import { defaultTemplate, normalizeTemplate } from "./label";
import type { Snapshot, UnitDTO, DeliveryDTO, SettingsDTO, LabelTemplate } from "./types";

export async function loadUnits(): Promise<UnitDTO[]> {
  const rows = await prisma.unit.findMany({ orderBy: { dateCreation: "asc" } });
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
    sub: s?.sub ?? "ST-4471",
    proj: s?.proj ?? "24-3095",
    ops: ops.map((o) => o.name),
  };
}

export async function loadTemplate(): Promise<LabelTemplate> {
  const row = await prisma.labelTemplate.findUnique({ where: { id: 1 } });
  if (!row) return defaultTemplate();
  return normalizeTemplate(row.data as unknown as LabelTemplate);
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [units, deliveries, settings, template] = await Promise.all([
    loadUnits(),
    loadDeliveries(),
    loadSettings(),
    loadTemplate(),
  ]);
  return { units, deliveries, settings, template };
}
