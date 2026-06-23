"use client";

import { toast } from "sonner";
import { useApp } from "./app-context";
import { LabelView } from "./label-view";
import { SectionHeader } from "./ui-bits";
import { Field, inputCls } from "./atelier";
import { saveTemplateAction } from "@/app/actions";
import {
  LABEL_PRESETS,
  FAM,
  DISPLAY_SCALE,
  autoArrange,
} from "@/lib/label";
import { connectUSB, isUsbConnected } from "@/lib/usb";
import type {
  LabelTemplate,
  LabelElementKey,
  UnitDTO,
  CodeType,
  PrintMethod,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const PART_KEYS: Array<LabelElementKey | "code"> = [
  "header",
  "po",
  "modele",
  "serie",
  "sub",
  "date",
  "iso",
  "code",
];

function clone(t: LabelTemplate): LabelTemplate {
  return JSON.parse(JSON.stringify(t));
}

export function LabelEditor() {
  const { settings, template, setTemplate, ui, setUi, t } = useApp();
  const ro = ui.client;

  const sample: UnitDTO = {
    id: "sample",
    sub: settings.sub,
    projet: settings.proj,
    reference: "A1",
    serie: "001",
    po: "PO-2026-1185",
    dessin: "",
    batchId: "",
    livraison: "",
    dateCreation: new Date().toISOString(),
    etiquette: { par: null, date: null, imprimee: false },
    montage: { par: null, date: null },
    test: { par: null, date: null, diel: null, pol: null, eff: null },
    verification: { par: null, date: null },
    nc: "",
  };

  const commit = (next: LabelTemplate) => {
    setTemplate(next);
    void saveTemplateAction(next);
  };
  const mutate = (fn: (d: LabelTemplate) => void) => {
    const next = clone(template);
    fn(next);
    commit(next);
  };

  // --- drag sur l'aperçu ---
  const onElementPointerDown = (key: string, e: React.PointerEvent) => {
    if (ro) return;
    e.preventDefault();
    e.stopPropagation();
    if (ui.selPart !== key) {
      setUi({ selPart: key as LabelElementKey | "code" });
      return;
    }
    const sx = e.clientX,
      sy = e.clientY;
    const obj = key === "code" ? template.code : template.elements[key as LabelElementKey];
    const ox = obj.x,
      oy = obj.y;
    let nx = ox,
      ny = oy;
    const S = DISPLAY_SCALE;
    const move = (mv: PointerEvent) => {
      nx = Math.max(0, Math.min(template.w - 1, ox + (mv.clientX - sx) / S));
      ny = Math.max(0, Math.min(template.h - 1, oy + (mv.clientY - sy) / S));
      // déplacement visuel direct
      const el = document.querySelector<HTMLElement>(`[data-ekey="${key}"]`);
      if (el) {
        el.style.left = `${nx * S}px`;
        el.style.top = `${ny * S}px`;
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      mutate((d) => {
        const o = key === "code" ? d.code : d.elements[key as LabelElementKey];
        o.x = Math.round(nx * 10) / 10;
        o.y = Math.round(ny * 10) / 10;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      <SectionHeader title={t.labelTitle} lead={t.labelLead} />
      <div className="grid items-start gap-5 [grid-template-columns:1fr_330px] max-[780px]:[grid-template-columns:1fr]">
        <div>
          <div>
            {!ro && (
              <div className="mb-4 flex flex-wrap gap-3">
                <Field label={t.preset}>
                  <select
                    value={template.presetId}
                    onChange={(e) => {
                      const p = LABEL_PRESETS.find((x) => x.id === e.target.value);
                      if (!p) return;
                      mutate((d) => {
                        d.presetId = p.id;
                        d.w = p.w;
                        d.h = p.h;
                        autoArrange(d);
                      });
                    }}
                    className={inputCls}
                  >
                    {LABEL_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t.widthMm}>
                  <input
                    type="number"
                    step={0.5}
                    value={template.w}
                    onChange={(e) => mutate((d) => (d.w = parseFloat(e.target.value) || 0))}
                    className={inputCls + " w-[100px]"}
                  />
                </Field>
                <Field label={t.heightMm}>
                  <input
                    type="number"
                    step={0.5}
                    value={template.h}
                    onChange={(e) => mutate((d) => (d.h = parseFloat(e.target.value) || 0))}
                    className={inputCls + " w-[100px]"}
                  />
                </Field>
                <Field label={t.codeType}>
                  <select
                    value={template.code.type}
                    onChange={(e) => mutate((d) => (d.code.type = e.target.value as CodeType))}
                    className={inputCls}
                  >
                    <option value="qr">{t.codeQR}</option>
                    <option value="barcode">{t.codeBar}</option>
                    <option value="none">{t.codeNone}</option>
                  </select>
                </Field>
                <Field label={t.font}>
                  <select
                    value={template.font}
                    onChange={(e) => mutate((d) => (d.font = e.target.value))}
                    className={inputCls}
                  >
                    <option value={FAM.sans}>{t.famSans}</option>
                    <option value={FAM.mono}>{t.famMono}</option>
                    <option value={FAM.serif}>{t.famSerif}</option>
                  </select>
                </Field>
                <button
                  onClick={() => mutate((d) => autoArrange(d))}
                  className="self-end rounded-[9px] border border-line bg-transparent px-3 py-2 text-[13px] font-bold hover:border-amber hover:text-amber"
                >
                  {t.autoArrange}
                </button>
              </div>
            )}

            {/* aperçu */}
            <div className="flex min-h-[200px] items-center justify-center overflow-auto rounded-xl border border-line bg-[#42474d] p-[30px]">
              <LabelView
                unit={sample}
                template={template}
                selectedKey={ro ? null : ui.selPart}
                onElementPointerDown={ro ? undefined : onElementPointerDown}
              />
            </div>

            {/* chips éléments */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {PART_KEYS.map((k) => {
                const hidden = k !== "code" && !template.elements[k as LabelElementKey].show;
                const off = k === "code" && template.code.type === "none";
                return (
                  <button
                    key={k}
                    onClick={() => setUi({ selPart: k })}
                    className={cn(
                      "rounded-lg border border-line bg-panel2 px-3 py-2 text-xs font-bold text-muted-foreground",
                      ui.selPart === k && "border-amber bg-amber text-[#16181a]",
                      (hidden || off) && "line-through opacity-45",
                    )}
                  >
                    {t.parts[k]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* impression */}
          {!ro && <PrintPanel mutate={mutate} />}
        </div>

        {/* inspecteur */}
        <div className="sticky top-[112px] rounded-xl border border-line bg-panel p-[18px]">
          {ro ? (
            <p className="m-0 text-sm text-muted-foreground">{t.clientReadonly}</p>
          ) : (
            <>
              <h3 className="mb-3.5 text-sm font-semibold">
                {t.editPart} {t.parts[ui.selPart]}
              </h3>
              <Inspector mutate={mutate} />
              <p className="mt-2 text-[11px] text-faint">{t.dragHint}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Inspector({ mutate }: { mutate: (fn: (d: LabelTemplate) => void) => void }) {
  const { template, ui, t } = useApp();
  const key = ui.selPart;

  if (key === "code") {
    const c = template.code;
    if (c.type === "none")
      return <p className="text-[11px] text-faint">{t.codeNone} — {t.codeType}.</p>;
    return (
      <>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t.fX}>
            <input
              type="number"
              step={0.5}
              value={c.x}
              onChange={(e) => mutate((d) => (d.code.x = parseFloat(e.target.value) || 0))}
              className={inputCls + " w-full"}
            />
          </Field>
          <Field label={t.fY}>
            <input
              type="number"
              step={0.5}
              value={c.y}
              onChange={(e) => mutate((d) => (d.code.y = parseFloat(e.target.value) || 0))}
              className={inputCls + " w-full"}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label={t.fCodeSize}>
            <input
              type="number"
              step={0.5}
              value={c.size}
              onChange={(e) => mutate((d) => (d.code.size = parseFloat(e.target.value) || 0))}
              className={inputCls + " w-full"}
            />
          </Field>
        </div>
      </>
    );
  }

  const el = template.elements[key as LabelElementKey];
  const lit = key === "header" || key === "iso";

  return (
    <>
      <label className="mb-3.5 flex items-center gap-2.5 text-[13px]">
        <input
          type="checkbox"
          className="h-[17px] w-[17px] accent-amber"
          checked={el.show}
          onChange={(e) => mutate((d) => (d.elements[key as LabelElementKey].show = e.target.checked))}
        />
        {t.fShow}
      </label>
      <div className="mb-3">
        <Field label={lit ? t.fText : t.fPrefix}>
          <input
            value={el.text}
            onChange={(e) => mutate((d) => (d.elements[key as LabelElementKey].text = e.target.value))}
            className={inputCls + " w-full"}
          />
        </Field>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <Field label={t.fX}>
          <input
            type="number"
            step={0.5}
            value={el.x}
            onChange={(e) => mutate((d) => (d.elements[key as LabelElementKey].x = parseFloat(e.target.value) || 0))}
            className={inputCls + " w-full"}
          />
        </Field>
        <Field label={t.fY}>
          <input
            type="number"
            step={0.5}
            value={el.y}
            onChange={(e) => mutate((d) => (d.elements[key as LabelElementKey].y = parseFloat(e.target.value) || 0))}
            className={inputCls + " w-full"}
          />
        </Field>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <Field label={t.fSize}>
          <input
            type="number"
            step={0.5}
            value={el.font}
            onChange={(e) => mutate((d) => (d.elements[key as LabelElementKey].font = parseFloat(e.target.value) || 1))}
            className={inputCls + " w-full"}
          />
        </Field>
        <Field label={t.fFamily}>
          <select
            value={el.family}
            onChange={(e) =>
              mutate((d) => (d.elements[key as LabelElementKey].family = e.target.value as LabelTemplate["elements"][LabelElementKey]["family"]))
            }
            className={inputCls + " w-full"}
          >
            <option value="">{t.famGlobal}</option>
            <option value="sans">{t.famSans}</option>
            <option value="mono">{t.famMono}</option>
            <option value="serif">{t.famSerif}</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2.5 text-[13px]">
        <input
          type="checkbox"
          className="h-[17px] w-[17px] accent-amber"
          checked={el.bold}
          onChange={(e) => mutate((d) => (d.elements[key as LabelElementKey].bold = e.target.checked))}
        />
        {t.fBold}
      </label>
    </>
  );
}

function PrintPanel({ mutate }: { mutate: (fn: (d: LabelTemplate) => void) => void }) {
  const { template, t } = useApp();
  const pm = (template.print && template.print.method) || "dialog";
  const dpiv = (template.print && template.print.dpi) || 203;
  const usbConnected = isUsbConnected();

  const hint = pm === "dialog" ? t.pmHintDialog : pm === "silent" ? t.pmHintSilent : t.pmHintZpl;

  return (
    <div className="mt-4">
      <h3 className="mb-3 text-sm font-semibold">{t.printTitle}</h3>
      <div className="flex flex-wrap items-end gap-2.5">
        <Field label={t.printMethod}>
          <select
            value={pm}
            onChange={(e) => mutate((d) => (d.print.method = e.target.value as PrintMethod))}
            className={inputCls}
          >
            <option value="dialog">{t.pmDialog}</option>
            <option value="silent">{t.pmSilent}</option>
            <option value="zpl">{t.pmZpl}</option>
          </select>
        </Field>
        {pm === "zpl" && (
          <>
            <Field label={t.dpiL}>
              <select
                value={dpiv}
                onChange={(e) => mutate((d) => (d.print.dpi = parseInt(e.target.value, 10) || 203))}
                className={inputCls}
              >
                <option value={203}>203 dpi</option>
                <option value={300}>300 dpi</option>
              </select>
            </Field>
            <button
              onClick={async () => {
                const out = await connectUSB();
                if (out === "ok") toast.success(t.connectedOk);
                else
                  toast.error(
                    out === "unsupported"
                      ? t.usbUnsupported
                      : out === "noiface"
                        ? t.usbNoIface
                        : t.usbCancelled,
                  );
              }}
              className="self-end rounded-[9px] border border-line bg-transparent px-3 py-2 text-[13px] font-bold hover:border-amber hover:text-amber"
            >
              {t.connectPrinter}
            </button>
            <div
              className={cn(
                "self-end text-xs font-bold",
                usbConnected ? "text-pass" : "text-muted-foreground",
              )}
            >
              {usbConnected ? `● ${t.printerConnected}` : `○ ${t.printerNone}`}
            </div>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] text-faint">{hint}</p>
    </div>
  );
}
