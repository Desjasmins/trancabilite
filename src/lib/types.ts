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
  montage: { par: string | null; date: string | null };
  test: {
    par: string | null;
    date: string | null;
    diel: TestResult;
    pol: TestResult;
    eff: TestResult;
  };
  verification: { par: string | null; date: string | null };
  nc: string;

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

export interface Snapshot {
  units: UnitDTO[];
  deliveries: DeliveryDTO[];
  settings: SettingsDTO;
  template: LabelTemplate;
  operations: OperationDTO[];
  routes: RouteDTO[];
}
