import { z } from "zod";

export const testResult = z.enum(["accept", "refus"]);

export const createBatchSchema = z.object({
  po: z.string().trim().max(60).optional().default(""),
  projet: z.string().trim().min(1, "Projet requis").max(60),
  reference: z.string().trim().min(1, "Référence requise").max(60),
  qty: z.coerce.number().int().min(1).max(500),
  start: z.string().trim().optional(),
  sub: z.string().trim().max(60).optional().default(""),
  operator: z.string().trim().max(80).nullable().optional(),
  routeId: z.string().trim().optional(), // gamme de fabrication ; défaut = gamme par défaut
});
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const updateBatchSchema = z.object({
  batchId: z.string().min(1),
  po: z.string().trim().max(60).optional().default(""),
  projet: z.string().trim().min(1, "Projet requis").max(60),
  reference: z.string().trim().min(1, "Référence requise").max(60),
  sub: z.string().trim().max(60).optional().default(""),
  routeId: z.string().trim().min(1, "Gamme requise"),
});
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;

export const retestUnitSchema = z.object({
  unitId: z.string().min(1),
  operator: z.string().trim().min(1, "Opérateur requis"),
  note: z.string().trim().max(300).optional().default(""),
});
export type RetestUnitInput = z.infer<typeof retestUnitSchema>;

/** Remise en essai depuis le Bureau (#3) : pas d'opérateur, il vient de la session. */
export const retestUnitOfficeSchema = retestUnitSchema.omit({ operator: true });

export const confirmMontageBulkSchema = z.object({
  unitIds: z.array(z.string().min(1)).min(1).max(500),
  operator: z.string().trim().min(1, "Opérateur requis"),
});
export type ConfirmMontageBulkInput = z.infer<typeof confirmMontageBulkSchema>;

export const confirmMontageSchema = z.object({
  unitId: z.string().min(1),
  operator: z.string().trim().min(1, "Opérateur requis").max(80),
});

export const confirmTestSchema = z.object({
  unitId: z.string().min(1),
  operator: z.string().trim().min(1).max(80),
  diel: testResult,
  pol: testResult,
  eff: testResult,
  nc: z.string().trim().max(500).optional().default(""),
});

export const confirmVerifSchema = z.object({
  unitId: z.string().min(1),
  operator: z.string().trim().min(1).max(80),
});

export const packUnitSchema = z.object({
  unitId: z.string().min(1),
  deliveryId: z.string().trim().min(1),
});

export const createDeliverySchema = z.object({
  id: z.string().trim().min(1, "ID requis").max(40),
  client: z.string().trim().max(120).optional().default(""),
});

export const closeDeliverySchema = z.object({
  id: z.string().trim().min(1),
});

export const saveSettingsSchema = z.object({
  sub: z.string().trim().max(60),
  proj: z.string().trim().max(60),
  ops: z.array(z.string().trim().min(1).max(80)).max(100),
});

// Gabarit d'étiquette — validé de façon structurée mais tolérante.
const labelElement = z.object({
  show: z.boolean(),
  text: z.string().max(120),
  x: z.number(),
  y: z.number(),
  font: z.number(),
  bold: z.boolean(),
  family: z.enum(["", "sans", "mono", "serif"]),
});

export const labelTemplateSchema = z.object({
  presetId: z.string(),
  w: z.number().positive().max(500),
  h: z.number().positive().max(500),
  font: z.string(),
  code: z.object({
    type: z.enum(["qr", "barcode", "none"]),
    x: z.number(),
    y: z.number(),
    size: z.number(),
  }),
  elements: z.object({
    header: labelElement,
    po: labelElement,
    modele: labelElement,
    serie: labelElement,
    sub: labelElement,
    date: labelElement,
    iso: labelElement,
  }),
  print: z.object({
    method: z.enum(["dialog", "silent", "zpl"]),
    dpi: z.number().int(),
  }),
});

export const reprintPrintedSchema = z.object({
  unitIds: z.array(z.string().min(1)).max(500),
});

// ---- Écrans d'atelier (#4) ----
const kioskLabel = z.string().trim().min(1, "Nom de l'écran requis").max(60);
const kioskId = z.string().min(1, "Écran requis");

export const pairKioskSchema = z.object({ label: kioskLabel });
export const revokeKioskSchema = z.object({ id: kioskId });
export const renameKioskSchema = z.object({ id: kioskId, label: kioskLabel });
