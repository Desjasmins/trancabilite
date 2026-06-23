import type { LabelTemplate, LabelElementKey, UnitDTO } from "./types";

export const LABEL_PRESETS = [
  { id: "lb-62x35", name: "Lightbase standard (62 × 35 mm)", w: 62, h: 35 },
  { id: "brother-90x29", name: "Brother DK-1201 (90 × 29 mm)", w: 90, h: 29 },
  { id: "brother-62x29", name: "Brother DK-11209 (62 × 29 mm)", w: 62, h: 29 },
  { id: "brother-62x100", name: "Brother DK-11202 (62 × 100 mm)", w: 62, h: 100 },
  { id: "dymo-89x28", name: "Dymo 30252 adresse (89 × 28 mm)", w: 89, h: 28 },
  { id: "dymo-57x32", name: "Dymo 30334 (57 × 32 mm)", w: 57, h: 32 },
  { id: "zebra-51x25", name: "Zebra 2 × 1 po (51 × 25 mm)", w: 51, h: 25 },
  { id: "zebra-76x51", name: "Zebra 3 × 2 po (76 × 51 mm)", w: 76, h: 51 },
  { id: "zebra-102x152", name: "Zebra 4 × 6 po (102 × 152 mm)", w: 102, h: 152 },
  { id: "avery-67x25", name: "Avery 5160 (67 × 25 mm)", w: 66.7, h: 25.4 },
  { id: "custom", name: "Personnalisé", w: 62, h: 35 },
] as const;

export const FAM: Record<string, string> = {
  sans: "Arial, Helvetica, sans-serif",
  mono: '"Courier New", ui-monospace, monospace',
  serif: "Georgia, 'Times New Roman', serif",
};
export const famCss = (k: string) => FAM[k] || "";

export const DISPLAY_SCALE = 4.2;
export const PT_MM = 0.352778;

export const ELEMENT_ORDER: LabelElementKey[] = [
  "header",
  "po",
  "modele",
  "serie",
  "sub",
  "date",
];

export const modele = (u: Pick<UnitDTO, "projet" | "reference">) =>
  `${u.projet}-${u.reference}`;

export const pad = (n: number) => String(n).padStart(3, "0");

export function dateShort() {
  return new Date().toLocaleDateString("fr-CA");
}

export function payloadFor(u: UnitDTO) {
  return `LB|${u.sub}|${modele(u)}|SN${u.serie}`;
}

export function elText(key: string, el: { text?: string }, u: UnitDTO): string {
  if (key === "header" || key === "iso") return el.text || "";
  if (key === "modele") return (el.text || "") + modele(u);
  if (key === "serie") return (el.text || "") + u.serie;
  if (key === "po") return (el.text || "") + (u.po || "");
  if (key === "sub") return (el.text || "") + u.sub;
  if (key === "date") return (el.text || "") + dateShort();
  return "";
}

export function autoArrange(tpl: LabelTemplate) {
  const w = tpl.w,
    h = tpl.h,
    E = tpl.elements;
  const cl = (v: number, mn: number, mx: number) =>
    Math.round(Math.max(mn, Math.min(mx, v)) * 10) / 10;
  const cs = cl(Math.min(h - 3, w * 0.36), 10, Math.max(10, h - 2));
  tpl.code.size = cs;
  tpl.code.x = cl(w - cs - 2, 0, w);
  tpl.code.y = cl((h - cs) / 2 - 1, 1, h);
  const small = cl(h * 0.135, 4.5, 7.5),
    big = cl(h * 0.26, 8, 14);
  E.header.font = cl(small * 0.95, 4, 7);
  E.po.font = small;
  E.sub.font = small;
  E.date.font = small;
  E.modele.font = big;
  E.modele.bold = true;
  E.serie.font = cl(big * 0.78, 7, 12);
  E.serie.bold = true;
  const leftX = 2;
  let y = 2;
  ELEMENT_ORDER.forEach((k) => {
    const el = E[k];
    el.x = leftX;
    el.y = Math.round(y * 10) / 10;
    if (el.show) y += el.font * 0.352778 * 1.18 + 0.7;
  });
  E.iso.x = cl(tpl.code.x, 0, w);
  E.iso.y = cl(Math.min(h - 2.5, tpl.code.y + cs + 0.6), 1, h);
  E.iso.font = cl(small * 0.85, 4, 6.5);
  E.iso.bold = true;
}

export function defaultTemplate(): LabelTemplate {
  const tpl: LabelTemplate = {
    presetId: "lb-62x35",
    w: 62,
    h: 35,
    font: FAM.sans,
    code: { type: "qr", x: 0, y: 0, size: 22 },
    elements: {
      header: { show: true, text: "Lightbase · Sous-assemblage", x: 2, y: 2, font: 6, bold: false, family: "" },
      po: { show: false, text: "PO ", x: 2, y: 2, font: 6, bold: false, family: "mono" },
      modele: { show: true, text: "", x: 2, y: 2, font: 13, bold: true, family: "mono" },
      serie: { show: true, text: "S.N. ", x: 2, y: 2, font: 10, bold: true, family: "mono" },
      sub: { show: true, text: "No s.-t. ", x: 2, y: 2, font: 6.5, bold: false, family: "mono" },
      date: { show: true, text: "", x: 2, y: 2, font: 6.5, bold: false, family: "mono" },
      iso: { show: true, text: "ISO 9001", x: 2, y: 2, font: 6, bold: true, family: "" },
    },
    print: { method: "dialog", dpi: 203 },
  };
  autoArrange(tpl);
  return tpl;
}

export function normalizeTemplate(tpl: LabelTemplate): LabelTemplate {
  if (!tpl.elements.po)
    tpl.elements.po = { show: false, text: "PO ", x: 34, y: 2, font: 6.5, bold: false, family: "mono" };
  if (!tpl.print) tpl.print = { method: "dialog", dpi: 203 };
  return tpl;
}

// ZPL généré côté client à l'impression (port de zplFor).
export function zplEsc(s: string) {
  return String(s).replace(/[\^~]/g, " ");
}

export function zplFor(u: UnitDTO, tpl: LabelTemplate): string {
  const dpi = (tpl.print && tpl.print.dpi) || 203,
    dpm = dpi / 25.4,
    D = (mm: number) => Math.round(mm * dpm);
  let z = `^XA^CI28^PW${D(tpl.w)}^LL${D(tpl.h)}^LH0,0`;
  (["header", "po", "modele", "serie", "sub", "date", "iso"] as LabelElementKey[]).forEach((key) => {
    const el = tpl.elements[key];
    if (!el || !el.show) return;
    const fh = Math.max(12, Math.round(el.font * dpi / 72));
    z += `^FO${D(el.x)},${D(el.y)}^A0N,${fh},${fh}^FD${zplEsc(elText(key, el, u))}^FS`;
  });
  if (tpl.code.type === "qr") {
    const mag = Math.max(2, Math.min(10, Math.round((tpl.code.size * dpm) / 42)));
    z += `^FO${D(tpl.code.x)},${D(tpl.code.y)}^BQN,2,${mag}^FDLA,${payloadFor(u)}^FS`;
  } else if (tpl.code.type === "barcode") {
    const bh = Math.max(20, Math.round(tpl.code.size * 0.42 * dpm));
    z += `^FO${D(tpl.code.x)},${D(tpl.code.y)}^BCN,${bh},N,N,N^FD${modele(u)}-${u.serie}^FS`;
  }
  return z + "^XZ";
}
