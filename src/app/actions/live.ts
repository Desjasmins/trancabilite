"use server";

import { loadUnits, loadBatches, loadDeliveries } from "@/lib/queries";
import { withAccess } from "@/lib/access/with-access";
import { projectSnapshot } from "@/lib/access/project";
import type { Actor } from "@/lib/access/policy";
import type { ActionResult } from "./_shared";

/** Recharge les données vivantes (déclenché par la synchro temps réel). */
async function getLiveData(_input: unknown, actor: Actor): Promise<ActionResult> {
  const [units, batches, deliveries] = await Promise.all([
    loadUnits(),
    loadBatches(),
    loadDeliveries(),
  ]);
  // Même projection que la page (#3) : un client ne reçoit jamais ce que la page lui retire.
  return projectSnapshot({ ok: true, units, batches, deliveries }, actor);
}

const getLiveDataGuarded = withAccess("getLiveDataAction", getLiveData);
export async function getLiveDataAction(): Promise<ActionResult> {
  return getLiveDataGuarded(undefined);
}
