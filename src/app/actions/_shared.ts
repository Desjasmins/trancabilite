import "server-only";

// Socle commun des Server Actions. Ce module n'a PAS "use server" : avec la
// directive, chaque export (dont recordOperation) deviendrait un point d'entrée
// appelable depuis le client (doc Next 16, 01-directives/use-server.md).
import { prisma } from "@/lib/db";
import { EventResult } from "@/generated/prisma/client";
import { nextOp } from "@/lib/process";
import type {
  UnitDTO,
  BatchDTO,
  DeliveryDTO,
  SettingsDTO,
  LabelTemplate,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  units?: UnitDTO[];
  batches?: BatchDTO[];
  deliveries?: DeliveryDTO[];
  settings?: SettingsDTO;
  template?: LabelTemplate;
  createdIds?: string[];
  doneCount?: number;
  failCount?: number;
}

export function fail(error: string): ActionResult {
  return { ok: false, error };
}

/**
 * Transition transactionnelle : insère un événement immuable et avance la gamme.
 * Garde (étape attendue), idempotence (re-scan) et verrou optimiste (version).
 */
export async function recordOperation(
  unitId: string,
  operationKey: string,
  opts: {
    operator: string;
    result: EventResult;
    data?: unknown;
    note?: string;
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({
      where: { id: unitId },
      include: { batch: { include: { route: { include: { steps: true } } } } },
    });
    if (!unit) throw new Error("Unité introuvable");
    if (unit.blocked) throw new Error("Unité bloquée (non conforme)");
    if (unit.currentOperationKey !== operationKey)
      throw new Error("Cette unité n'est pas à cette étape");

    const steps =
      unit.batch?.route?.steps
        ?.slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => s.operationKey) ?? [];

    const failed = opts.result === EventResult.fail;
    const next = failed ? unit.currentOperationKey : nextOp(steps, operationKey);

    await tx.traceEvent.create({
      data: {
        unitId,
        operationKey,
        result: opts.result,
        operator: opts.operator,
        data: (opts.data as object) ?? undefined,
        note: opts.note || null,
      },
    });

    const upd = await tx.unit.updateMany({
      where: { id: unitId, version: unit.version },
      data: {
        currentOperationKey: failed ? unit.currentOperationKey : next,
        blocked: failed,
        nc: failed ? opts.note || null : unit.nc,
        version: { increment: 1 },
      },
    });
    if (upd.count === 0) throw new Error("Conflit de concurrence, réessayez");
  });
}
