"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { LabelView } from "./label-view";
import { QHeader, EmptyState } from "./ui-bits";
import {
  createBatchAction,
  confirmMontageAction,
  confirmTestAction,
  confirmVerifAction,
  packUnitAction,
  createDeliveryAction,
  closeDeliveryAction,
  markPrintedAction,
} from "@/app/actions";
import { statut, queueFor, byId, nextDeliveryId } from "@/lib/status";
import { modele } from "@/lib/label";
import { printLabels, printSlip } from "@/lib/print";
import type { StationKey, UnitDTO, TestResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATION_ORDER: StationKey[] = [
  "etiquettes",
  "montage",
  "test",
  "verification",
  "emballage",
];
const TILE_ICON: Record<StationKey, string> = {
  etiquettes: "🏷",
  montage: "🔧",
  test: "⚡",
  verification: "✓",
  emballage: "📦",
};

export function Atelier() {
  const { ui } = useApp();
  if (ui.station === null) return <AtelierHome />;
  if (ui.station === "etiquettes") return <EtiquettesStation />;
  if (ui.station === "emballage") return <EmballageStation />;
  return <ScanStation station={ui.station} />;
}

/* ===================== Accueil ===================== */
function AtelierHome() {
  const { units, ui, setUi, t } = useApp();
  const counts: Record<string, number> = {
    montage: queueFor(units, "montage").length,
    test: queueFor(units, "test").length,
    verification: queueFor(units, "verification").length,
    emballage: queueFor(units, "emballage").length,
  };
  void ui;
  return (
    <>
      <h2 className="text-lg font-semibold">{t.chooseStation}</h2>
      <p className="mb-[18px] mt-0.5 text-sm text-muted-foreground">{t.subtitle}</p>
      <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {STATION_ORDER.map((k) => {
          const c = counts[k];
          return (
            <button
              key={k}
              onClick={() => setUi({ station: k, scanUnit: null, lastCreated: [] })}
              className="flex min-h-[150px] flex-col justify-between rounded-2xl border border-line bg-panel p-[22px] text-left transition-colors hover:border-amber"
            >
              <div className="text-[30px] leading-none">{TILE_ICON[k]}</div>
              <div>
                <div className="mt-2.5 text-[19px] font-bold">{t.stations[k]}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t.stationDesc[k]}
                </div>
              </div>
              {c != null ? (
                <span className={`chip chip-${k === "emballage" ? "pret" : k}`}>
                  {c} {t.units}
                </span>
              ) : (
                <span />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ===================== Barre de poste ===================== */
function KBar({ station, extra }: { station: StationKey; extra?: React.ReactNode }) {
  const { ui, setUi, t } = useApp();
  const op = ui.op[station];
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <button
        onClick={() => setUi({ station: null, scanUnit: null })}
        className="rounded-[10px] border border-line px-4 py-[11px] text-sm font-bold hover:border-amber hover:text-amber"
      >
        ‹ {t.postes}
      </button>
      <span className="text-xl font-bold">{t.stations[station]}</span>
      {op && (
        <span className="inline-flex items-center gap-2 rounded-full border border-[#1f4634] bg-[#14241c] px-3.5 py-2 text-[13px] font-bold text-[#bff0d6]">
          {t.operator}: {op}{" "}
          <button
            className="text-xs font-bold text-[#7fd6a8] underline"
            onClick={() => setUi({ op: { ...ui.op, [station]: undefined }, scanUnit: null })}
          >
            {t.changeOp}
          </button>
        </span>
      )}
      <div className="flex-1" />
      {extra}
    </div>
  );
}

function OpPicker({ station }: { station: StationKey }) {
  const { settings, ui, setUi, t } = useApp();
  return (
    <>
      <KBar station={station} />
      <h2 className="mb-4 text-lg font-semibold">{t.whoAreYou}</h2>
      {settings.ops.length ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
          {settings.ops.map((o) => (
            <button
              key={o}
              onClick={() => setUi({ op: { ...ui.op, [station]: o } })}
              className="min-h-[78px] rounded-[14px] border border-line bg-panel px-[18px] py-6 text-[18px] font-bold hover:border-amber hover:text-amber"
            >
              {o}
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>{t.noOperatorsHint}</EmptyState>
      )}
    </>
  );
}

/* ===================== Scan ===================== */
function findByScan(units: UnitDTO[], raw: string): UnitDTO | null {
  raw = (raw || "").trim();
  if (!raw) return null;
  if (raw.includes("|")) {
    const p = raw.split("|");
    const m = p[2],
      sn = (p[3] || "").replace(/^SN/i, "");
    return units.find((u) => modele(u) === m && u.serie === sn) || null;
  }
  const up = raw.toUpperCase();
  return (
    units.find((u) => u.serie === raw) ||
    units.find((u) => modele(u).toUpperCase() === up) ||
    units.find((u) => `${modele(u)}-${u.serie}`.toUpperCase() === up) ||
    null
  );
}

function ScanInput() {
  const { units, ui, setUi, t } = useApp();
  const ref = useRef<HTMLInputElement>(null);

  const process = (raw: string) => {
    const u = findByScan(units, raw);
    if (!u) {
      toast.error(t.notFound);
      return;
    }
    const map: Record<string, string> = {
      montage: "montage",
      test: "test",
      verification: "verification",
    };
    if (statut(u) !== map[ui.station as string]) {
      toast.error(t.notFound);
      return;
    }
    setUi({ scanUnit: u.id, pendingTest: { diel: null, pol: null, eff: null }, verifArm: false });
  };

  return (
    <div className="mb-5 rounded-2xl border-2 border-dashed border-[#3a4047] bg-panel p-[22px] text-center">
      <div className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold tracking-[0.05em] text-amber">
        <span className="scan-pulse-dot" />
        {t.scanReady}
      </div>
      <div>
        <input
          ref={ref}
          autoComplete="off"
          autoFocus
          placeholder={t.scanField}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const v = e.currentTarget.value;
              e.currentTarget.value = "";
              process(v);
            }
          }}
          className="w-full max-w-[440px] rounded-xl border border-line bg-panel2 px-[18px] py-4 text-center font-mono text-[22px] text-foreground outline-none focus:border-amber focus:outline-2 focus:outline-amber"
        />
      </div>
      <div className="mt-2.5 text-xs text-faint">{t.scanHint}</div>
    </div>
  );
}

function ScanStation({ station }: { station: StationKey }) {
  const { units, ui } = useApp();
  if (!ui.op[station]) return <OpPicker station={station} />;
  const scanned = ui.scanUnit ? byId(units, ui.scanUnit) : null;
  if (scanned)
    return (
      <>
        <KBar station={station} />
        <ActionCard unit={scanned} station={station} />
      </>
    );
  return (
    <>
      <KBar station={station} />
      <ScanInput />
      <WaitingList station={station} />
    </>
  );
}

function WaitingList({ station }: { station: StationKey }) {
  const { units, setUi, t } = useApp();
  const q = queueFor(units, station);
  return (
    <>
      <QHeader label={`${t.waiting} · ${q.length}`} />
      {q.length ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {q.map((u) => (
            <button
              key={u.id}
              onClick={() =>
                setUi({
                  scanUnit: u.id,
                  pendingTest: { diel: null, pol: null, eff: null },
                  verifArm: false,
                })
              }
              className="flex min-h-[104px] flex-col justify-between rounded-[14px] border border-line bg-panel p-[18px] text-left hover:border-amber"
            >
              <div className="font-mono text-[18px] font-bold">{modele(u)}</div>
              <div className="mt-1 font-mono text-[13px] text-muted-foreground">
                S.N. {u.serie}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>{t.noWaiting}</EmptyState>
      )}
    </>
  );
}

/* ===================== Carte d'action ===================== */
function ActionCard({ unit, station }: { unit: UnitDTO; station: StationKey }) {
  const { ui, setUi, run, t } = useApp();
  const ncRef = useRef<HTMLTextAreaElement>(null);
  const op = ui.op[station]!;

  const setTg = (k: keyof typeof ui.pendingTest, val: TestResult) => {
    const cur = ui.pendingTest[k];
    setUi({ pendingTest: { ...ui.pendingTest, [k]: cur === val ? null : val } });
  };

  const doMontage = async () => {
    const res = await run(confirmMontageAction({ unitId: unit.id, operator: op }), t.toastMont);
    if (res.ok) setUi({ scanUnit: null });
  };

  const doTest = async () => {
    const p = ui.pendingTest;
    if (!p.diel || !p.pol || !p.eff) return;
    const rej = [p.diel, p.pol, p.eff].includes("refus");
    const res = await run(
      confirmTestAction({
        unitId: unit.id,
        operator: op,
        diel: p.diel,
        pol: p.pol,
        eff: p.eff,
        nc: rej ? ncRef.current?.value ?? "" : "",
      }),
      rej ? t.toastReject : t.toastTest,
      rej,
    );
    if (res.ok) setUi({ scanUnit: null, pendingTest: { diel: null, pol: null, eff: null } });
  };

  const doVerif = async () => {
    if (op === unit.montage.par && !ui.verifArm) {
      setUi({ verifArm: true });
      return;
    }
    const res = await run(confirmVerifAction({ unitId: unit.id, operator: op }), t.toastVerif);
    if (res.ok) setUi({ scanUnit: null, verifArm: false });
  };

  const showNc = Object.values(ui.pendingTest).includes("refus");
  const same = op === unit.montage.par;

  return (
    <div className="mx-auto max-w-[580px] rounded-[18px] border border-line bg-panel p-[26px]">
      <div className="font-mono text-[28px] font-bold">{modele(unit)}</div>
      <div className="mt-1 font-mono text-base text-muted-foreground">
        S.N. {unit.serie} · {unit.dessin || ""}
      </div>

      {station === "montage" && (
        <BigBtn onClick={doMontage}>
          {t.confirmMont} — {op}
        </BigBtn>
      )}

      {station === "test" && (
        <>
          <div className="mt-5">
            {(["diel", "pol", "eff"] as const).map((k) => (
              <div
                key={k}
                className="flex items-center justify-between gap-3 border-t border-line py-4 first:border-t-0"
              >
                <div className="text-[17px] font-bold">
                  {t[k]}
                  <small className="block text-[11px] font-normal text-faint">PAN 003</small>
                </div>
                <div className="flex gap-2">
                  <TgBtn on={ui.pendingTest[k] === "accept"} kind="a" onClick={() => setTg(k, "accept")}>
                    {t.accept}
                  </TgBtn>
                  <TgBtn on={ui.pendingTest[k] === "refus"} kind="r" onClick={() => setTg(k, "refus")}>
                    {t.refus}
                  </TgBtn>
                </div>
              </div>
            ))}
          </div>
          <textarea
            ref={ncRef}
            rows={2}
            placeholder={t.ncNote}
            className={cn(
              "mt-3 w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-amber",
              showNc ? "block" : "hidden",
            )}
          />
          <BigBtn onClick={doTest}>{t.confirmTest}</BigBtn>
        </>
      )}

      {station === "verification" && (
        <>
          {same && ui.verifArm && (
            <div className="mt-3.5 rounded-[10px] border border-[#5a2326] bg-[#3a1719] px-[15px] py-3 text-[13px] text-[#ffb3b6]">
              {t.sameWarn}
            </div>
          )}
          <BigBtn variant="ok" onClick={doVerif}>
            {t.confirmVerif} — {op}
          </BigBtn>
        </>
      )}

      <BigBtn variant="ghost" onClick={() => setUi({ scanUnit: null, verifArm: false })}>
        {t.cancel}
      </BigBtn>
    </div>
  );
}

function BigBtn({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "ok" | "ghost";
}) {
  const { pending } = useApp();
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={cn(
        "mt-[18px] min-h-[66px] w-full rounded-[14px] px-[22px] py-[18px] text-[18px] font-bold tracking-[0.02em] transition-colors disabled:opacity-60",
        variant === "ok" && "bg-pass text-[#0b1f15]",
        variant === "ghost" && "border border-line bg-transparent text-foreground",
        !variant && "bg-amber text-[#16181a] hover:bg-amber-bright",
      )}
    >
      {children}
    </button>
  );
}

function TgBtn({
  children,
  on,
  kind,
  onClick,
}: {
  children: React.ReactNode;
  on: boolean;
  kind: "a" | "r";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "min-h-[60px] min-w-[118px] rounded-xl border border-line bg-transparent p-4 text-[15px] font-bold text-muted-foreground",
        on && kind === "a" && "border-pass bg-pass text-[#0b1f15]",
        on && kind === "r" && "border-fail bg-fail text-[#2a0c0e]",
      )}
    >
      {children}
    </button>
  );
}

/* ===================== Étiquettes ===================== */
function EtiquettesStation() {
  const { units, settings, template, ui, setUi, run, t, pending } = useApp();
  const poRef = useRef<HTMLInputElement>(null);
  const projRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);

  const op = ui.op.etiquettes;
  const created = ui.lastCreated.map((id) => byId(units, id)).filter(Boolean) as UnitDTO[];

  if (!op) return <OpPicker station="etiquettes" />;

  const doCreate = async () => {
    const res = await run(
      createBatchAction({
        po: poRef.current?.value,
        projet: projRef.current?.value,
        reference: refRef.current?.value,
        qty: qtyRef.current?.value,
        start: startRef.current?.value,
        sub: subRef.current?.value,
        operator: op,
      }),
    );
    if (res.ok && res.createdIds) {
      setUi({ lastCreated: res.createdIds });
      const fresh = (res.units ?? []).filter((u) => res.createdIds!.includes(u.id));
      const out = await printLabels(fresh, template, t);
      if (out.ok) {
        toast.success(out.message);
        void markPrintedAction({ unitIds: res.createdIds }).then((r) => r.units);
      } else toast.error(out.message);
    }
  };

  const printOne = async (u: UnitDTO) => {
    const out = await printLabels([u], template, t);
    if (out.ok) toast.success(out.message);
    else toast.error(out.message);
  };
  const printAll = async () => {
    const out = await printLabels(created, template, t);
    if (out.ok) toast.success(out.message);
    else toast.error(out.message);
  };

  return (
    <>
      <KBar station="etiquettes" />
      <div className="mb-5 rounded-2xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label={t.poField}>
            <input ref={poRef} placeholder="PO-2026-…" className={inputCls + " w-[150px]"} />
          </Field>
          <Field label={t.proj}>
            <input ref={projRef} defaultValue={settings.proj} className={inputCls + " w-[130px]"} />
          </Field>
          <Field label={t.ref}>
            <input ref={refRef} placeholder="A1" className={inputCls + " w-[100px]"} />
          </Field>
          <Field label={t.qty}>
            <input ref={qtyRef} type="number" min={1} defaultValue={3} className={inputCls + " w-[90px]"} />
          </Field>
          <Field label={t.startSerial}>
            <input ref={startRef} type="number" placeholder="auto" className={inputCls + " w-[110px]"} />
          </Field>
          <Field label={t.sub} grow>
            <input ref={subRef} defaultValue={settings.sub} className={inputCls + " w-full"} />
          </Field>
          <button
            onClick={doCreate}
            disabled={pending}
            className="self-end rounded-[9px] bg-amber px-[17px] py-[11px] font-bold text-[#16181a] hover:bg-amber-bright disabled:opacity-60"
          >
            {t.create}
          </button>
        </div>
      </div>

      {created.length ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="m-0 text-xs uppercase tracking-wider text-muted-foreground">
              {t.createdLabels} · {created.length}
            </p>
            <div className="flex-1" />
            <button
              onClick={printAll}
              className="rounded-[9px] border border-line bg-transparent px-3 py-2 text-[13px] font-bold hover:border-amber hover:text-amber"
            >
              {t.printAll}
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {created.map((u) => (
              <div key={u.id} className="flex flex-col items-start gap-2">
                <LabelView unit={u} template={template} />
                <button
                  onClick={() => printOne(u)}
                  className="rounded-[9px] border border-line bg-transparent px-3 py-2 text-[13px] font-bold hover:border-amber hover:text-amber"
                >
                  {t.printOne}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState>{t.noCreated}</EmptyState>
      )}
    </>
  );
}

/* ===================== Emballage ===================== */
function EmballageStation() {
  const { units, deliveries, ui, setUi, run, t, lang } = useApp();
  const idRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const back = (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <button
        onClick={() => setUi({ station: null, scanUnit: null })}
        className="rounded-[10px] border border-line px-4 py-[11px] text-sm font-bold hover:border-amber hover:text-amber"
      >
        ‹ {t.postes}
      </button>
      <span className="text-xl font-bold">{t.stations.emballage}</span>
    </div>
  );

  // --- pas de livraison active : créer ou reprendre ---
  if (!ui.activeDelivery) {
    const open = deliveries.filter((d) => !d.closed);
    const createDeliv = async () => {
      const id = (idRef.current?.value || "").trim();
      if (!id) return;
      const res = await run(
        createDeliveryAction({ id, client: clientRef.current?.value || "" }),
      );
      if (res.ok) setUi({ activeDelivery: id });
    };
    return (
      <>
        {back}
        <h2 className="mb-1 text-lg font-semibold">{t.newDelivery}</h2>
        <p className="mb-5 text-sm text-muted-foreground">{t.chooseCreateDelivery}</p>
        <div className="mb-5 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-end gap-2.5">
            <Field label={t.delivId}>
              <input
                ref={idRef}
                defaultValue={nextDeliveryId(deliveries, new Date().getFullYear())}
                className={inputCls + " w-[170px]"}
              />
            </Field>
            <Field label={t.deliveryClient} grow>
              <input ref={clientRef} placeholder="…" className={inputCls + " w-full"} />
            </Field>
            <button
              onClick={createDeliv}
              className="self-end rounded-[9px] bg-amber px-[17px] py-[11px] font-bold text-[#16181a] hover:bg-amber-bright"
            >
              {t.createDeliveryBtn}
            </button>
          </div>
        </div>
        {open.length ? (
          <>
            <QHeader label={`${t.openDeliveries} · ${open.length}`} />
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
              {open.map((d) => {
                const n = units.filter((u) => u.livraison === d.id).length;
                return (
                  <button
                    key={d.id}
                    onClick={() => setUi({ activeDelivery: d.id })}
                    className="flex min-h-[104px] flex-col justify-between rounded-[14px] border border-line bg-panel p-[18px] text-left hover:border-amber"
                  >
                    <div className="font-mono text-[18px] font-bold">{d.id}</div>
                    <div className="mt-1 font-mono text-[13px] text-muted-foreground">
                      {d.client || "—"} · {n} {t.units}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState>{t.noOpenDeliveries}</EmptyState>
        )}
      </>
    );
  }

  // --- livraison active ---
  const d = deliveries.find((x) => x.id === ui.activeDelivery);
  const inDeliv = units.filter((u) => u.livraison === ui.activeDelivery);
  const ready = queueFor(units, "emballage");

  const processScan = async (raw: string) => {
    const u = findByScan(units, raw);
    if (!u) return toast.error(t.notFound);
    if (statut(u) !== "pret") return toast.error(t.notFound);
    const res = await run(
      packUnitAction({ unitId: u.id, deliveryId: ui.activeDelivery }),
      t.toastPacked,
    );
    void res;
  };

  const pack = async (u: UnitDTO) => {
    await run(packUnitAction({ unitId: u.id, deliveryId: ui.activeDelivery }), t.toastPacked);
  };

  const slip = () => {
    const out = printSlip(ui.activeDelivery, units, deliveries, t, lang);
    if (!out.ok && out.message) toast.error(out.message);
  };
  const close = async () => {
    const res = await run(closeDeliveryAction({ id: ui.activeDelivery }));
    if (res.ok) {
      printSlip(ui.activeDelivery, units, deliveries, t, lang);
      setUi({ activeDelivery: "" });
      toast.success(t.deliveryClosed);
    }
  };

  return (
    <>
      {back}
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#1b3a5a] bg-[#16304a] px-3.5 py-2 text-[13px] font-bold text-[#bfe0ff]">
          {t.activeDeliveryL}: {ui.activeDelivery}
          {d?.client ? ` · ${d.client}` : ""}{" "}
          <button
            className="text-xs font-bold underline"
            onClick={() => setUi({ activeDelivery: "", scanUnit: null })}
          >
            {t.changeDelivery}
          </button>
        </span>
        <div className="flex-1" />
        {inDeliv.length > 0 && (
          <>
            <button
              onClick={slip}
              className="rounded-[9px] border border-line bg-transparent px-3 py-2 text-[13px] font-bold hover:border-amber hover:text-amber"
            >
              {t.printSlip}
            </button>
            <button
              onClick={close}
              className="rounded-[9px] bg-amber px-3 py-2 text-[13px] font-bold text-[#16181a] hover:bg-amber-bright"
            >
              {t.closeDeliveryBtn}
            </button>
          </>
        )}
      </div>

      <div className="mb-5 mt-2 rounded-2xl border-2 border-dashed border-[#3a4047] bg-panel p-[22px] text-center">
        <div className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold tracking-[0.05em] text-amber">
          <span className="scan-pulse-dot" />
          {t.scanReady}
        </div>
        <input
          ref={scanRef}
          autoComplete="off"
          autoFocus
          placeholder={t.scanField}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const v = e.currentTarget.value;
              e.currentTarget.value = "";
              void processScan(v);
            }
          }}
          className="w-full max-w-[440px] rounded-xl border border-line bg-panel2 px-[18px] py-4 text-center font-mono text-[22px] text-foreground outline-none focus:border-amber focus:outline-2 focus:outline-amber"
        />
        <div className="mt-2.5 text-xs text-faint">{t.scanHint}</div>
      </div>

      <QHeader label={`${t.inThisDeliveryL} · ${inDeliv.length}`} />
      {inDeliv.length > 0 && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {inDeliv.map((u) => (
            <div
              key={u.id}
              className="flex min-h-[104px] cursor-default flex-col justify-between rounded-[14px] border border-[#1f4634] bg-[#14241c] p-[18px]"
            >
              <div className="font-mono text-[18px] font-bold text-[#bff0d6]">{modele(u)}</div>
              <div className="mt-1 font-mono text-[13px] text-muted-foreground">
                S.N. {u.serie} · {u.po || ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mb-3 mt-6 text-xs uppercase tracking-wider text-muted-foreground">
        {t.st.pret} · {ready.length}
      </p>
      {ready.length ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {ready.map((u) => (
            <button
              key={u.id}
              onClick={() => pack(u)}
              className="flex min-h-[104px] flex-col justify-between rounded-[14px] border border-line bg-panel p-[18px] text-left hover:border-amber"
            >
              <div className="font-mono text-[18px] font-bold">{modele(u)}</div>
              <div className="mt-1 font-mono text-[13px] text-muted-foreground">
                S.N. {u.serie} · {u.projet}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>{t.noWaiting}</EmptyState>
      )}
    </>
  );
}

/* ===================== petits utilitaires ===================== */
export const inputCls =
  "rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber";

export function Field({
  label,
  grow,
  children,
}: {
  label: string;
  grow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", grow && "min-w-[170px] flex-1")}>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
