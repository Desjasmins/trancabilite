"use server";

import { prisma } from "@/lib/db";
import { EventResult } from "@/generated/prisma/client";
import { loadUnits } from "@/lib/queries";
import {
  confirmMontageSchema,
  confirmMontageBulkSchema,
  retestUnitSchema,
  retestUnitOfficeSchema,
  confirmTestSchema,
  confirmVerifSchema,
  packUnitSchema,
} from "@/lib/schemas";
import { BusinessError, fail, failInvalid, errorText, recordOperation, reworkUnit, type ActionResult } from "./_shared";
import { withAccess } from "@/lib/access/with-access";
import type { Actor } from "@/lib/access/policy";

/** Écran appairé d'où vient l'appel (#4) : écrit au journal, l'opérateur saisi reste intact. */
const stationOf = (actor: Actor) => actor.kiosk?.id ?? null;

async function confirmMontage(input: unknown, actor: Actor): Promise<ActionResult> {
  const parsed = confirmMontageSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { unitId, operator } = parsed.data;
  try {
    await recordOperation(unitId, "montage", { operator, result: EventResult.done, stationId: stationOf(actor) });
    return { ok: true, units: await loadUnits() };
  } catch (e) {
    return fail(errorText(e));
  }
}

/**
 * Confirme le montage de plusieurs unités d'un coup (sélection au poste).
 * Chaque unité passe par recordOperation individuellement : les gardes
 * (étape attendue, unité bloquée, verrou optimiste) s'appliquent unité par
 * unité, et un échec n'empêche pas les autres de passer.
 */
async function confirmMontageBulk(input: unknown, actor: Actor): Promise<ActionResult> {
  const parsed = confirmMontageBulkSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { unitIds, operator } = parsed.data;

  let done = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const id of unitIds) {
    try {
      await recordOperation(id, "montage", { operator, result: EventResult.done, stationId: stationOf(actor) });
      done++;
    } catch (e) {
      failed++;
      errors.push(errorText(e));
    }
  }

  // done === 0 ⇒ au moins une erreur (le schéma exige une unité) : pas de repli mort (D15).
  if (done === 0) return fail(errors[0]);
  return { ok: true, units: await loadUnits(), doneCount: done, failCount: failed };
}

/**
 * Remet en essai une unité non conforme après réparation : événement `rework`
 * au journal (l'historique du refus reste intact), déblocage, et l'unité
 * réapparaît dans la file de l'opération où elle avait échoué (test).
 */
async function retestUnit(input: unknown, actor: Actor): Promise<ActionResult> {
  const parsed = retestUnitSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { unitId, operator, note } = parsed.data;
  try {
    await reworkUnit(unitId, operator, note, stationOf(actor));
  } catch (e) {
    return fail(errorText(e));
  }
  return { ok: true, units: await loadUnits() };
}

/**
 * Remise en essai depuis le Bureau (#3, Q1) : l'opérateur écrit au journal est le nom
 * du compte connecté, lu côté serveur ; l'entrée n'en porte pas (ignorée si présente).
 */
async function retestUnitOffice(input: unknown, actor: Actor): Promise<ActionResult> {
  const parsed = retestUnitOfficeSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  try {
    // STAFF_WRITE garantit un utilisateur : `user` n'est jamais nul ici.
    await reworkUnit(parsed.data.unitId, actor.user!.name, parsed.data.note, stationOf(actor));
  } catch (e) {
    return fail(errorText(e));
  }
  return { ok: true, units: await loadUnits() };
}

async function confirmTest(input: unknown, actor: Actor): Promise<ActionResult> {
  const parsed = confirmTestSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { unitId, operator, diel, pol, eff, visual, nc } = parsed.data;
  const electricFail = [diel, pol, eff].includes("refus");
  const visualFail = visual === "refus";
  const rejected = electricFail || visualFail;
  try {
    // #21 : un refus visuel renvoie au Montage sans bloquer, même avec un échec électrique
    // (décision de Gedeon) ; l'échec électrique reste dans `data` et l'essai sera refait.
    await recordOperation(unitId, "test", {
      operator,
      result: rejected ? EventResult.fail : EventResult.pass,
      data: { diel, pol, eff, visual },
      note: rejected ? nc : "",
      stationId: stationOf(actor),
      reworkTo: visualFail ? { step: "montage", cause: "visual" } : undefined,
    });
    return { ok: true, units: await loadUnits() };
  } catch (e) {
    return fail(errorText(e));
  }
}

async function confirmVerif(input: unknown, actor: Actor): Promise<ActionResult> {
  const parsed = confirmVerifSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { unitId, operator } = parsed.data;
  try {
    await recordOperation(unitId, "verification", { operator, result: EventResult.done, stationId: stationOf(actor) });
    return { ok: true, units: await loadUnits() };
  } catch (e) {
    return fail(errorText(e));
  }
}

/**
 * Emballe une unité prête dans une livraison (#8). Relecture, garde « prête » et
 * écriture dans une même transaction, sous verrou de version : deux écrans qui
 * emballent la même unité ne peuvent pas réussir tous les deux. Une livraison
 * fermée n'est pas refusée ici (décision de Gedeon, comportement conservé).
 */
async function packUnit(input: unknown): Promise<ActionResult> {
  const parsed = packUnitSchema.safeParse(input);
  if (!parsed.success) return failInvalid(parsed.error);
  const { unitId, deliveryId } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({ where: { id: unitId } });
      if (!unit) throw new BusinessError("Unité introuvable");
      if (unit.deliveryId) throw new BusinessError("UNIT_ALREADY_PACKED");
      if (unit.blocked || unit.currentOperationKey !== null)
        throw new BusinessError("Unité non prête à emballer");

      const delivery = await tx.delivery.findUnique({ where: { id: deliveryId } });
      if (!delivery) throw new BusinessError("Livraison introuvable");

      const upd = await tx.unit.updateMany({
        where: { id: unitId, version: unit.version },
        data: { deliveryId, version: { increment: 1 } },
      });
      if (upd.count === 0) throw new BusinessError("UNIT_PACK_CONFLICT");
    });
    return { ok: true, units: await loadUnits() };
  } catch (e) {
    return fail(errorText(e));
  }
}

// Points d'entrée : chaque export passe par la garde, politique lue dans POLICIES (#3).
const confirmMontageGuarded = withAccess("confirmMontageAction", confirmMontage);
export async function confirmMontageAction(input: unknown): Promise<ActionResult> {
  return confirmMontageGuarded(input);
}
const confirmMontageBulkGuarded = withAccess("confirmMontageBulkAction", confirmMontageBulk);
export async function confirmMontageBulkAction(input: unknown): Promise<ActionResult> {
  return confirmMontageBulkGuarded(input);
}
const retestUnitGuarded = withAccess("retestUnitAction", retestUnit);
export async function retestUnitAction(input: unknown): Promise<ActionResult> {
  return retestUnitGuarded(input);
}
const confirmTestGuarded = withAccess("confirmTestAction", confirmTest);
export async function confirmTestAction(input: unknown): Promise<ActionResult> {
  return confirmTestGuarded(input);
}
const confirmVerifGuarded = withAccess("confirmVerifAction", confirmVerif);
export async function confirmVerifAction(input: unknown): Promise<ActionResult> {
  return confirmVerifGuarded(input);
}
const packUnitGuarded = withAccess("packUnitAction", packUnit);
export async function packUnitAction(input: unknown): Promise<ActionResult> {
  return packUnitGuarded(input);
}
const retestUnitOfficeGuarded = withAccess("retestUnitOfficeAction", retestUnitOffice);
export async function retestUnitOfficeAction(input: unknown): Promise<ActionResult> {
  return retestUnitOfficeGuarded(input);
}
