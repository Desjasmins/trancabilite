"use client";

import * as XLSX from "xlsx";
import { modele } from "./label";
import { statut } from "./status";
import type { UnitDTO, TestResult } from "./types";
import type { Dict, Lang } from "./i18n";

function fmtDate(iso: string, lang: Lang) {
  const d = new Date(iso);
  return d.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function trLabel(v: TestResult, t: Dict): string {
  if (v === "accept") return t.accept;
  if (v === "refus") return t.refus;
  return "";
}

/** Exporte la liste (déjà filtrée) du registre en fichier .xlsx téléchargé. */
export function exportRegistryXlsx(units: UnitDTO[], t: Dict, lang: Lang) {
  const rows = units.map((u) => ({
    [t.thSerial]: u.serie,
    [t.thModel]: modele(u),
    [t.thProj]: u.projet,
    [t.thPO]: u.po || "",
    [t.thDeliv]: u.livraison || "",
    [t.thMont]: u.montage.par || "",
    [t.thTest]: u.test.par || "",
    [t.thVerif]: u.verification.par || "",
    [t.diel]: trLabel(u.test.diel, t),
    [t.pol]: trLabel(u.test.pol, t),
    [t.eff]: trLabel(u.test.eff, t),
    [t.thStatus]: t.st[statut(u)],
    [lang === "fr" ? "Non-conformité" : "Nonconformance"]: u.nc || "",
    [t.thDate]: fmtDate(u.dateCreation, lang),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.regTitle.slice(0, 31));

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `registre-tracabilite-${stamp}.xlsx`);
}
