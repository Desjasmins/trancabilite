"use client";

import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import {
  ELEMENT_ORDER,
  famCss,
  elText,
  payloadFor,
  modele,
  zplFor,
} from "./label";
import { statut } from "./status";
import { connectUSB, sendZPL, isUsbConnected } from "./usb";
import type { LabelTemplate, LabelElementKey, UnitDTO, DeliveryDTO } from "./types";
import type { Dict, Lang } from "./i18n";

const esc = (s: unknown) =>
  (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

async function codeDataUrl(u: UnitDTO, tpl: LabelTemplate): Promise<string | null> {
  if (tpl.code.type === "none") return null;
  if (tpl.code.type === "qr") {
    return QRCode.toDataURL(payloadFor(u), { width: 400, margin: 0, errorCorrectionLevel: "M" });
  }
  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, `${modele(u)}-${u.serie}`, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 80,
      width: 2,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function labelHtml(u: UnitDTO, tpl: LabelTemplate): Promise<string> {
  const mm = (v: number) => `${v}mm`;
  const els = (ELEMENT_ORDER.concat("iso") as LabelElementKey[])
    .map((key) => {
      const el = tpl.elements[key];
      if (!el || !el.show) return "";
      const fam = el.family ? `font-family:${famCss(el.family)};` : "";
      return `<div style="position:absolute;left:${mm(el.x)};top:${mm(el.y)};white-space:nowrap;line-height:1.05;font-size:${el.font}pt;font-weight:${el.bold ? 700 : 400};${fam}">${esc(elText(key, el, u))}</div>`;
    })
    .join("");

  let codeHtml = "";
  if (tpl.code.type !== "none") {
    const isQR = tpl.code.type === "qr";
    const cw = tpl.code.size;
    const ch = isQR ? tpl.code.size : tpl.code.size * 0.42;
    const url = await codeDataUrl(u, tpl);
    if (url)
      codeHtml = `<img src="${url}" style="position:absolute;left:${mm(tpl.code.x)};top:${mm(tpl.code.y)};width:${mm(cw)};height:${mm(ch)};object-fit:fill" />`;
  }

  return `<div class="lblroot" style="position:relative;width:${mm(tpl.w)};height:${mm(tpl.h)};background:#fff;color:#000;overflow:hidden;font-family:${tpl.font};page-break-after:always">${els}${codeHtml}</div>`;
}

function openPrintWindow(inner: string, pageMargin = "6mm") {
  const w = window.open("", "_blank", "width=700,height=600");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Impression</title><style>@page{margin:${pageMargin}}body{margin:0}.lblroot{box-shadow:none;margin:0 0 6mm}</style></head><body>${inner}<script>window.onload=function(){setTimeout(function(){window.print();},250);};window.onafterprint=function(){window.close();};</script></body></html>`,
  );
  w.document.close();
}

/** Imprime des étiquettes selon la méthode configurée (dialogue ou ZPL). */
export async function printLabels(
  units: UnitDTO[],
  tpl: LabelTemplate,
  t: Dict,
): Promise<{ ok: boolean; message: string; bad?: boolean }> {
  const valid = units.filter(Boolean);
  if (!valid.length) return { ok: false, message: t.notFound, bad: true };

  const method = (tpl.print && tpl.print.method) || "dialog";
  if (method === "zpl") {
    if (!isUsbConnected()) {
      const outcome = await connectUSB();
      if (outcome !== "ok") {
        const map: Record<string, string> = {
          unsupported: t.usbUnsupported,
          cancelled: t.usbCancelled,
          noiface: t.usbNoIface,
        };
        return { ok: false, message: map[outcome] ?? t.usbSendFail, bad: true };
      }
    }
    const zpl = valid.map((u) => zplFor(u, tpl)).join("");
    const sent = await sendZPL(zpl);
    return sent
      ? { ok: true, message: t.printedZpl }
      : { ok: false, message: t.usbSendFail, bad: true };
  }

  const parts = await Promise.all(valid.map((u) => labelHtml(u, tpl)));
  openPrintWindow(parts.join(""));
  return { ok: true, message: t.toastPrinted };
}

/** Construit et imprime le bon de livraison (rapport papier). */
export function printSlip(
  deliveryId: string,
  units: UnitDTO[],
  deliveries: DeliveryDTO[],
  t: Dict,
  lang: Lang,
): { ok: boolean; message?: string; bad?: boolean } {
  const arr = units
    .filter((u) => u.livraison === deliveryId)
    .sort(
      (a, b) => modele(a).localeCompare(modele(b)) || a.serie.localeCompare(b.serie),
    );
  if (!arr.length) return { ok: false, message: t.repNone, bad: true };

  const dlv = deliveries.find((x) => x.id === deliveryId);
  const tc = (v: string | null) => (v === "accept" ? "A" : v === "refus" ? "R" : "–");
  const projets = [...new Set(arr.map((u) => u.projet))].join(", ");
  const pos = [...new Set(arr.map((u) => u.po).filter(Boolean))].join(", ");
  const d = new Date().toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA");

  const rows = arr
    .map(
      (u) => `<tr><td>${esc(u.serie)}</td><td>${esc(modele(u))}</td><td>${esc(u.po || "")}</td>
      <td>${esc(u.montage.par || "")}</td><td>${esc(u.test.par || "")}</td><td>${esc(u.verification.par || "")}</td>
      <td style="text-align:center">${tc(u.test.diel)}</td><td style="text-align:center">${tc(u.test.pol)}</td><td style="text-align:center">${tc(u.test.eff)}</td>
      <td>${t.st[statut(u)]}</td></tr>`,
    )
    .join("");

  const html = `<div class="report">
    <div class="rhead"><div><h1>${t.deliverySlip}</h1><div style="font-size:12pt;margin-top:4px">${esc(deliveryId)}</div>${dlv?.client ? `<div style="font-size:10pt;margin-top:2px">${t.client}: ${esc(dlv.client)}</div>` : ""}</div>
      <div class="rmeta">LIGHTBASE<br>${t.subcontractor}: ${esc(arr[0].sub)}<br>${t.proj}: ${esc(projets)}${pos ? `<br>PO: ${esc(pos)}` : ""}<br>${t.date}: ${d}<br>${arr.length} ${t.units}</div></div>
    <h2 style="font-size:11pt;margin:16px 0 6px;color:#000">${t.reportH}</h2>
    <table><thead><tr><th>${t.thSerial}</th><th>${t.thModel}</th><th>${t.thPO}</th><th>${t.sigMont}</th><th>${t.sigTest}</th><th>${t.sigVerif}</th><th>${t.diel}</th><th>${t.pol}</th><th>${t.eff}</th><th>${t.thStatus}</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="sig"><div>${t.sigMont}</div><div>${t.sigTest}</div><div>${t.sigVerif}</div></div>
  </div>`;

  const style = `<style>
    body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;margin:0}
    .report{padding:4mm}
    .rhead{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px}
    h1{font-size:16pt;margin:0}
    .rmeta{font-size:9pt;text-align:right;line-height:1.5}
    table{width:100%;border-collapse:collapse;font-size:8.5pt}
    th,td{border:1px solid #999;padding:5px 6px;color:#000}
    th{background:#eee;text-transform:uppercase;font-size:7.5pt}
    .sig{display:flex;gap:40px;margin-top:26px;font-size:9pt}
    .sig div{flex:1;border-top:1px solid #000;padding-top:5px}
  </style>`;

  const w = window.open("", "_blank", "width=820,height=700");
  if (!w) return { ok: false, message: t.usbSendFail, bad: true };
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(deliveryId)}</title>${style}</head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print();},250);};window.onafterprint=function(){window.close();};</script></body></html>`,
  );
  w.document.close();
  return { ok: true };
}
