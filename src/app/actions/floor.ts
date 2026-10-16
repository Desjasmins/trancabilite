"use server";

import { prisma } from "@/lib/db";
import { EventResult } from "@/generated/prisma/client";
import { loadUnits } from "@/lib/queries";
import { statut } from "@/lib/status";
import {
  confirmMontageSchema,
  confirmMontageBulkSchema,
  retestUnitSchema,
  confirmTestSchema,
  confirmVerifSchema,
  packUnitSchema,
} from "@/lib/schemas";
import { fail, recordOperation, type ActionResult } from "./_shared";

export async function confirmMontageAction(input: unknown): Promise<ActionResult> {
  const parsed = confirmMontageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitId, operator } = parsed.data;
  try {
    await recordOperation(unitId, "montage", { operator, result: EventResult.done });
    return { ok: true, units: await loadUnits() };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erreur");
  }
}

/**
 * Confirme le montage de plusieurs unités d'un coup (sélection au poste).
 * Chaque unité passe par recordOperation individuellement : les gardes
 * (étape attendue, unité bloquée, verrou optimiste) s'appliquent unité par
 * unité, et un échec n'empêche pas les autres de passer.
 */
export async function confirmMontageBulkAction(input: unknown): Promise<ActionResult> {
  const parsed = confirmMontageBulkSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitIds, operator } = parsed.data;

  let done = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const id of unitIds) {
    try {
      await recordOperation(id, "montage", { operator, result: EventResult.done });
      done++;
    } catch (e) {
      failed++;
      firstError ??= e instanceof Error ? e.message : "Erreur";
    }
  }

  if (done === 0) return fail(firstError ?? "Erreur");
  return { ok: true, units: await loadUnits(), doneCount: done, failCount: failed };
}

/**
 * Remet en essai une unité non conforme après réparation : événement `rework`
 * au journal (l'historique du refus reste intact), déblocage, et l'unité
 * réapparaît dans la file de l'opération où elle avait échoué (test).
 */
export async function retestUnitAction(input: unknown): Promise<ActionResult> {
  const parsed = retestUnitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitId, operator, note } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({ where: { id: unitId } });
      if (!unit) throw new Error("Unité introuvable");
      if (!unit.blocked) throw new Error("Cette unité n'est pas bloquée");
      if (!unit.currentOperationKey) throw new Error("Unité sans étape courante");

      await tx.traceEvent.create({
        data: {
          unitId,
          operationKey: unit.currentOperationKey,
          result: EventResult.rework,
          operator,
          note: note || null,
        },
      });

      const upd = await tx.unit.updateMany({
        where: { id: unitId, version: unit.version },
        data: { blocked: false, nc: null, version: { increment: 1 } },
      });
      if (upd.count === 0) throw new Error("Conflit de concurrence, réessayez");
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erreur");
  }
  return { ok: true, units: await loadUnits() };
}

export async function confirmTestAction(input: unknown): Promise<ActionResult> {
  const parsed = confirmTestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitId, operator, diel, pol, eff, nc } = parsed.data;
  const rejected = [diel, pol, eff].includes("refus");
  try {
    await recordOperation(unitId, "test", {
      operator,
      result: rejected ? EventResult.fail : EventResult.pass,
      data: { diel, pol, eff },
      note: rejected ? nc : "",
    });
    return { ok: true, units: await loadUnits() };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erreur");
  }
}

export async function confirmVerifAction(input: unknown): Promise<ActionResult> {
  const parsed = confirmVerifSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitId, operator } = parsed.data;
  try {
    await recordOperation(unitId, "verification", { operator, result: EventResult.done });
    return { ok: true, units: await loadUnits() };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erreur");
  }
}

export async function packUnitAction(input: unknown): Promise<ActionResult> {
  const parsed = packUnitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Entrée invalide");
  const { unitId, deliveryId } = parsed.data;

  const units = await loadUnits();
  const u = units.find((x) => x.id === unitId);
  if (!u) return fail("Unité introuvable");
  if (statut(u) !== "pret") return fail("Unité non prête à emballer");

  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return fail("Livraison introuvable");

  await prisma.unit.update({ where: { id: unitId }, data: { deliveryId } });
  return { ok: true, units: await loadUnits() };
}
