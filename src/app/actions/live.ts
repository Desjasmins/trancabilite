"use server";

import { loadUnits, loadBatches, loadDeliveries } from "@/lib/queries";
import type { ActionResult } from "./_shared";

/** Recharge les données vivantes (déclenché par la synchro temps réel). */
export async function getLiveDataAction(): Promise<ActionResult> {
  const [units, batches, deliveries] = await Promise.all([
    loadUnits(),
    loadBatches(),
    loadDeliveries(),
  ]);
  return { ok: true, units, batches, deliveries };
}
