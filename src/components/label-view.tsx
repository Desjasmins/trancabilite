"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import {
  DISPLAY_SCALE,
  PT_MM,
  ELEMENT_ORDER,
  famCss,
  elText,
  payloadFor,
  modele,
} from "@/lib/label";
import type { LabelTemplate, LabelElementKey, UnitDTO } from "@/lib/types";

interface Props {
  unit: UnitDTO;
  template: LabelTemplate;
  scale?: number;
  selectedKey?: string | null;
  onElementPointerDown?: (key: string, e: React.PointerEvent) => void;
}

export function LabelView({
  unit,
  template,
  scale = DISPLAY_SCALE,
  selectedKey = null,
  onElementPointerDown,
}: Props) {
  const codeRef = useRef<HTMLDivElement>(null);
  const tpl = template;
  const mm = (v: number) => v * scale;

  // (Ré)génère le code à chaque changement pertinent.
  useEffect(() => {
    const host = codeRef.current;
    if (!host) return;
    host.innerHTML = "";
    if (tpl.code.type === "none") return;
    const payload =
      tpl.code.type === "qr"
        ? payloadFor(unit)
        : `${modele(unit)}-${unit.serie}`;
    if (tpl.code.type === "qr") {
      const canvas = document.createElement("canvas");
      QRCode.toCanvas(canvas, payload, { width: 220, margin: 0, errorCorrectionLevel: "M" }).catch(
        () => {
          host.textContent = payload;
        },
      );
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      host.appendChild(canvas);
    } else {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      host.appendChild(svg);
      try {
        JsBarcode(svg, payload, {
          format: "CODE128",
          displayValue: false,
          margin: 0,
          height: 80,
          width: 2,
        });
        svg.setAttribute("preserveAspectRatio", "none");
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.display = "block";
      } catch {
        host.textContent = payload;
      }
    }
  }, [unit, tpl.code.type, tpl.code.size, tpl.w, tpl.h, unit.serie, unit.projet, unit.reference]);

  const isQR = tpl.code.type === "qr";
  const cw = tpl.code.size;
  const ch = isQR ? tpl.code.size : tpl.code.size * 0.42;

  return (
    <div
      className="lblroot"
      style={{
        position: "relative",
        width: mm(tpl.w),
        height: mm(tpl.h),
        background: "#fff",
        color: "#000",
        overflow: "hidden",
        fontFamily: tpl.font,
        borderRadius: 3,
        boxShadow: "0 2px 10px rgba(0,0,0,.25)",
        flex: "0 0 auto",
      }}
    >
      {(ELEMENT_ORDER.concat("iso") as LabelElementKey[]).map((key) => {
        const el = tpl.elements[key];
        if (!el || !el.show) return null;
        const selected = selectedKey === key;
        return (
          <div
            key={key}
            data-ekey={key}
            onPointerDown={
              onElementPointerDown ? (e) => onElementPointerDown(key, e) : undefined
            }
            style={{
              position: "absolute",
              left: mm(el.x),
              top: mm(el.y),
              whiteSpace: "nowrap",
              lineHeight: 1.05,
              fontSize: el.font * PT_MM * scale,
              fontWeight: el.bold ? 700 : 400,
              fontFamily: el.family ? famCss(el.family) : undefined,
              cursor: onElementPointerDown ? "move" : undefined,
              touchAction: onElementPointerDown ? "none" : undefined,
              outline: selected ? "1.5px solid #f5a623" : undefined,
            }}
          >
            {elText(key, el, unit)}
          </div>
        );
      })}
      {tpl.code.type !== "none" && (
        <div
          ref={codeRef}
          data-ekey="code"
          onPointerDown={
            onElementPointerDown ? (e) => onElementPointerDown("code", e) : undefined
          }
          style={{
            position: "absolute",
            left: mm(tpl.code.x),
            top: mm(tpl.code.y),
            width: mm(cw),
            height: mm(ch),
            cursor: onElementPointerDown ? "move" : undefined,
            touchAction: onElementPointerDown ? "none" : undefined,
            outline: selectedKey === "code" ? "1.5px solid #f5a623" : undefined,
          }}
        />
      )}
    </div>
  );
}
