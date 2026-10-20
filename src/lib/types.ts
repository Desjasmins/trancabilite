// Types DTO sérialisables, partagés entre serveur et client.
// On reflète la structure imbriquée de l'app d'origine pour porter la logique fidèlement.

export type TestResult = "accept" | "refus" | null;

export type StatusKey =
  | "montage"
  | "test"
  | "verification"
  | "pret"
  | "livre"
  | "rejet";

export type StationKey =
  | "etiquettes"
  | "montage"
  | "test"
  | "verification"
  | "emballage";

export interface UnitDTO {
  id: string;
  serie: string;
  projet: string;
  reference: string;
  po: string;
  dessin: string;
  sub: string;
  batchId: string;
  livraison: string; // id de la livraison ("" si aucune)
  dateCreation: string; // ISO
  etiquette: { par: string | null; date: string | null; imprimee: boolean };
  // `ecran` : libellé de l'écran d'atelier du dernier événement de l'étape (#4) ;
  // null = écran non identifié (historique, écran non appairé ou disparu).
  montage: { par: string | null; date: string | null; ecran: string | null };
  test: {
    par: string | null;
    date: string | null;
    ecran: string | null;
    diel: TestResult;
    pol: TestResult;
    eff: TestResult;
    /** Contrôle visuel (#21) ; null pour un essai antérieur à son introduction. */
    visual: TestResult;
  };
  verification: { par: string | null; date: string | null; ecran: string | null };
  nc: string;
  /** Renvoi au Montage en attente (#21) : dérivé du journal (`pendingRework`), seule source du badge « Reprise ». */
  reprise: { note: string; at: string } | null;
  /** Nombre de renvois (#22) : événements `rework` portant `data.to` ; les retests hérités ne comptent pas. Sans limite. */
  reprises: number;

  // Cache d'état (dérivé du journal d'événements)
  currentOperationKey: string | null; // prochaine opération attendue ; null = prêt à emballer
  blocked: boolean;
  version: number;
}

export interface OperationDTO {
  key: string;
  labelFr: string;
  labelEn: string;
  kind: "STANDARD" | "QC";
}

export interface RouteDTO {
  id: string;
  name: string;
  isDefault: boolean;
  steps: string[]; // clés d'opérations dans l'ordre
}

export interface BatchDTO {
  id: string;
  po: string;
  projet: string;
  reference: string;
  sub: string;
  routeId: string; // "" si aucune gamme
  createdBy: string;
  createdAt: string; // ISO
}

export interface DeliveryDTO {
  id: string;
  client: string;
  date: string; // ISO
  closed: boolean;
}

export interface SettingsDTO {
  sub: string;
  proj: string;
  ops: string[];
}

// ---- Gabarit d'étiquette ----
export type CodeType = "qr" | "barcode" | "none";
export type PrintMethod = "dialog" | "silent" | "zpl";

export interface LabelElement {
  show: boolean;
  text: string;
  x: number;
  y: number;
  font: number;
  bold: boolean;
  family: "" | "sans" | "mono" | "serif";
}

export type LabelElementKey =
  | "header"
  | "po"
  | "modele"
  | "serie"
  | "sub"
  | "date"
  | "iso";

export interface LabelTemplate {
  presetId: string;
  w: number;
  h: number;
  font: string;
  code: { type: CodeType; x: number; y: number; size: number };
  elements: Record<LabelElementKey, LabelElement>;
  print: { method: PrintMethod; dpi: number };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

/** Écran d'atelier appairé (#4), tel que l'onglet admin le liste. */
export interface KioskDTO {
  id: string;
  label: string;
  createdAt: string; // ISO
  lastSeenAt: string | null;
  revokedAt: string | null;
}

/** État de l'écran courant, résolu au rendu (#4). */
export type ScreenState = { status: "none" } | { status: "revoked" } | { status: "paired"; label: string };

export interface Snapshot {
  units: UnitDTO[];
  batches: BatchDTO[];
  deliveries: DeliveryDTO[];
  settings: SettingsDTO;
  template: LabelTemplate;
  operations: OperationDTO[];
  routes: RouteDTO[];
}
