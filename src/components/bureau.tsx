"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { LabelView } from "./label-view";
import { LabelEditor } from "./label-editor";
import { StatusChip, TestDot, SectionHeader, EmptyState } from "./ui-bits";
import { Field, inputCls } from "./atelier";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { saveSettingsAction, markPrintedAction, createBatchAction, updateBatchAction } from "@/app/actions";
import { statut, byId } from "@/lib/status";
import { modele } from "@/lib/label";
import { printLabels, printSlip } from "@/lib/print";
import { exportRegistryXlsx } from "@/lib/export";
import type { UnitDTO, BatchDTO, StatusKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_KEYS: StatusKey[] = [
  "montage",
  "test",
  "verification",
  "pret",
  "livre",
  "rejet",
];

export function Bureau() {
  const { ui } = useApp();
  switch (ui.bureauTab) {
    case "reg":
      return <ViewReg />;
    case "lots":
      return <ViewLots />;
    case "rep":
      return <ViewRep />;
    case "label":
      return <LabelEditor />;
    case "set":
      return <ViewSet />;
  }
}

/* ===================== Registre ===================== */
function ViewReg() {
  const { units, ui, setUi, t, lang } = useApp();
  const q = ui.query.toLowerCase();
  const list = units
    .filter((u) => {
      if (ui.filterStatus && statut(u) !== ui.filterStatus) return false;
      if (q) {
        const h = `${u.serie} ${modele(u)} ${u.projet} ${u.po || ""} ${u.livraison}`.toLowerCase();
        if (!h.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => modele(a).localeCompare(modele(b)) || a.serie.localeCompare(b.serie));

  return (
    <>
      <SectionHeader title={t.regTitle} lead={t.regLead} />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={ui.query}
          onChange={(e) => setUi({ query: e.target.value })}
          placeholder={t.search}
          className={inputCls + " min-w-[170px] flex-1"}
        />
        <select
          value={ui.filterStatus}
          onChange={(e) => setUi({ filterStatus: e.target.value as StatusKey | "" })}
          className={inputCls}
        >
          <option value="">{t.fAll}</option>
          {STATUS_KEYS.map((s) => (
            <option key={s} value={s}>
              {t.st[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => exportRegistryXlsx(list, t, lang)}
          disabled={!list.length}
          className="rounded-[9px] border border-line bg-transparent px-[13px] py-2.5 text-sm font-bold hover:border-amber hover:text-amber disabled:opacity-50"
        >
          {t.exportXlsx}
        </button>
      </div>

      <div className="overflow-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {[
                t.thSerial, t.thModel, t.thProj, t.thPO, t.thDeliv,
                t.thMont, t.thTest, t.thVerif, t.thTests, t.thStatus, t.thDate,
              ].map((h, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-10 border-b border-line bg-[#16181a] px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.length ? (
              list.map((u) => {
                const s = statut(u);
                return (
                  <tr
                    key={u.id}
                    onClick={() => setUi({ openId: u.id })}
                    className="cursor-pointer hover:bg-panel"
                  >
                    <Td mono>{u.serie}</Td>
                    <Td mono>{modele(u)}</Td>
                    <Td mono>{u.projet}</Td>
                    <Td mono>{u.po || ""}</Td>
                    <Td mono>{u.livraison || ""}</Td>
                    <Td mono>{u.montage.par || "·"}</Td>
                    <Td mono>{u.test.par || "·"}</Td>
                    <Td mono>{u.verification.par || "·"}</Td>
                    <td className="border-b border-line px-3 py-2.5">
                      <span className="inline-flex gap-1">
                        <TestDot v={u.test.diel} />
                        <TestDot v={u.test.pol} />
                        <TestDot v={u.test.eff} />
                      </span>
                    </td>
                    <td className="border-b border-line px-3 py-2.5">
                      <StatusChip s={s} />
                    </td>
                    <Td mono muted>
                      {fmt(u.dateCreation, t.none)}
                    </Td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DetailPanel />
    </>
  );
}

function Td({
  children,
  mono,
  muted,
}: {
  children: React.ReactNode;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-line px-3 py-2.5",
        mono && "font-mono",
        muted && "text-muted-foreground",
      )}
    >
      {children}
    </td>
  );
}

function DetailPanel() {
  const { units, ui, setUi, template, t } = useApp();
  const u = ui.openId ? byId(units, ui.openId) : null;
  const open = !!u;
  const s = u ? statut(u) : "montage";
  const bad = u ? [u.test.diel, u.test.pol, u.test.eff].includes("refus") : false;

  const reprint = async () => {
    if (!u) return;
    const out = await printLabels([u], template, t);
    if (out.ok) toast.success(out.message);
    else toast.error(out.message);
    if (out.ok) void markPrintedAction({ unitIds: [u.id] });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && setUi({ openId: null })}>
      <SheetContent className="w-full gap-0 overflow-auto border-line bg-background sm:max-w-[520px]">
        {u && (
          <>
            <SheetHeader className="border-b border-line">
              <SheetTitle className="flex items-center gap-3">
                <StatusChip s={s} />
              </SheetTitle>
            </SheetHeader>
            <div className="p-5">
              <div className="font-mono text-2xl font-bold">{modele(u)}</div>
              <div className="mt-1 font-mono text-muted-foreground">S.N. {u.serie}</div>

              <div className="my-3.5 grid grid-cols-2 gap-2.5">
                <MetaCell k={t.proj} v={u.projet} />
                <MetaCell k={t.ref} v={u.reference} />
                <MetaCell k={t.po} v={u.po || t.none} />
                <MetaCell k={t.deliv} v={u.livraison || t.none} />
                <MetaCell k={t.labeledBy} v={u.etiquette.par || t.none} />
                <MetaCell k={t.created} v={fmt(u.dateCreation, t.none)} />
              </div>

              <div className="my-3.5 flex">
                <RelayCell label={t.stations.montage} who={u.montage.par} date={u.montage.date} />
                <RelayCell label={t.stations.test} who={u.test.par} date={u.test.date} bad={bad} />
                <RelayCell
                  label={t.stations.verification}
                  who={u.verification.par}
                  date={u.verification.date}
                />
              </div>

              {bad && (
                <div className="rounded-[10px] border border-[#5a2326] bg-[#3a1719] px-[15px] py-3 text-[13px] text-[#ffb3b6]">
                  {t.toastReject}
                  {u.nc ? ` — ${u.nc}` : ""}
                </div>
              )}

              <div className="mt-4">
                <LabelView unit={u} template={template} />
              </div>

              {!ui.client && (
                <button
                  onClick={reprint}
                  className="mt-3.5 rounded-[9px] border border-line bg-transparent px-3 py-2 text-[13px] font-bold hover:border-amber hover:text-amber"
                >
                  {t.reprint}
                </button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MetaCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-faint">{k}</div>
      <div className="mt-1 font-mono text-[13px]">{v}</div>
    </div>
  );
}

function RelayCell({
  label,
  who,
  date,
  bad,
}: {
  label: string;
  who: string | null;
  date: string | null;
  bad?: boolean;
}) {
  const { t } = useApp();
  return (
    <div
      className={cn(
        "flex-1 border border-r-0 border-line bg-[#1c2024] px-2.5 py-2.5 first:rounded-l-lg last:rounded-r-lg last:border-r",
        who && !bad && "border-[#1f4634] bg-[#14241c]",
        who && bad && "border-[#5a2326] bg-[#2a1416]",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-xs text-muted-foreground",
          who && !bad && "text-pass",
          who && bad && "text-fail",
        )}
      >
        {who || t.none}
      </div>
      {date && <div className="mt-0.5 font-mono text-[10px] text-faint">{fmt(date, t.none)}</div>}
    </div>
  );
}

/* ===================== Lots ===================== */
function ViewLots() {
  const { units, batches: batchInfos, settings, template, routes, ui, run, t, pending } = useApp();
  const poRef = useRef<HTMLInputElement>(null);
  const projRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);
  const defaultRouteId = routes.find((r) => r.isDefault)?.id ?? routes[0]?.id ?? "";
  const [routeId, setRouteId] = useState(defaultRouteId);
  const [editId, setEditId] = useState<string | null>(null);

  const groups: Record<string, UnitDTO[]> = {};
  units.forEach((u) => {
    const b = u.batchId || "—";
    (groups[b] = groups[b] || []).push(u);
  });
  const batches = Object.entries(groups)
    .map(([id, arr]) => ({ id, arr }))
    .sort((a, b) => (b.arr[0].dateCreation || "").localeCompare(a.arr[0].dateCreation || ""));

  const createLot = async () => {
    // Création seulement — pas d'impression auto (les étiquettes s'impriment
    // séparément via « Réimprimer » ou au poste Étiquettes).
    await run(
      createBatchAction({
        po: poRef.current?.value,
        projet: projRef.current?.value,
        reference: refRef.current?.value,
        qty: qtyRef.current?.value,
        start: startRef.current?.value,
        sub: subRef.current?.value,
        operator: null,
        routeId,
      }),
      t.saved,
    );
  };

  const reprintBatch = async (id: string) => {
    const arr = units.filter((u) => (u.batchId || "—") === id);
    const out = await printLabels(arr, template, t);
    if (out.ok) toast.success(out.message);
    else toast.error(out.message);
  };

  return (
    <>
      <SectionHeader title={t.lotsTitle} lead={t.lotsLead} />
      {!ui.client && (
        <details className="mb-[18px]">
          <summary className="cursor-pointer font-bold text-amber [&::-webkit-details-marker]:hidden">
            + {t.newLot}
          </summary>
          <div className="mt-2.5 rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-end gap-2.5">
              <Field label={t.poField}>
                <input ref={poRef} placeholder="PO-2026-…" className={inputCls + " w-[150px]"} />
              </Field>
              <Field label={t.proj}>
                <input ref={projRef} placeholder="24-3110" className={inputCls + " w-[130px]"} />
              </Field>
              <Field label={t.ref}>
                <input ref={refRef} placeholder="B1" className={inputCls + " w-[90px]"} />
              </Field>
              <Field label={t.qty}>
                <input ref={qtyRef} type="number" min={1} defaultValue={3} className={inputCls + " w-[90px]"} />
              </Field>
              <Field label={t.startSerial}>
                <input ref={startRef} type="number" placeholder="auto" className={inputCls + " w-[110px]"} />
              </Field>
              <Field label={t.route}>
                <select
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  className={inputCls + " w-[150px]"}
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.sub} grow>
                <input ref={subRef} defaultValue={settings.sub} className={inputCls + " w-full"} />
              </Field>
              <button
                onClick={createLot}
                disabled={pending}
                className="self-end rounded-[9px] bg-amber px-[17px] py-[11px] font-bold text-[#16181a] hover:bg-amber-bright disabled:opacity-60"
              >
                {t.create}
              </button>
            </div>
          </div>
        </details>
      )}

      {batches.length ? (
        <div className="flex flex-col gap-2">
          {batches.map((b) => {
            const a = b.arr;
            const c: Record<string, number> = {};
            a.forEach((u) => {
              const s = statut(u);
              c[s] = (c[s] || 0) + 1;
            });
            const u0 = a[0];
            const info = batchInfos.find((x) => x.id === b.id) ?? null;
            const routeName = info ? routes.find((r) => r.id === info.routeId)?.name : null;
            return (
              <div
                key={b.id}
                className="rounded-xl border border-line bg-panel px-4 py-3.5"
              >
                <div className="grid items-center gap-3.5 [grid-template-columns:1.4fr_2fr_auto]">
                  <div>
                    <b className="text-base">{u0.po || t.none}</b>
                    <br />
                    <span className="font-mono text-xs text-muted-foreground">
                      {u0.projet}-{u0.reference} · {a.length} {t.lotUnits} ·{" "}
                      {u0.etiquette.par || t.createdBy}
                      {routeName ? ` · ${t.route} : ${routeName}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_KEYS.filter((k) => c[k]).map((k) => (
                      <span key={k} className={`chip chip-${k}`}>
                        {c[k]} {t.st[k]}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {!ui.client && info && (
                      <button
                        onClick={() => setEditId(editId === b.id ? null : b.id)}
                        className="rounded-[9px] border border-line bg-transparent px-3 py-2 text-[13px] font-bold hover:border-amber hover:text-amber"
                      >
                        {t.editLot}
                      </button>
                    )}
                    {!ui.client && (
                      <button
                        onClick={() => reprintBatch(b.id)}
                        className="rounded-[9px] border border-line bg-transparent px-3 py-2 text-[13px] font-bold hover:border-amber hover:text-amber"
                      >
                        {t.reprintBatch}
                      </button>
                    )}
                  </div>
                </div>
                {editId === b.id && info && (
                  <LotEditForm info={info} onClose={() => setEditId(null)} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState>{t.noLots}</EmptyState>
      )}
    </>
  );
}

/** Formulaire d'édition d'un lot (PO, projet, référence, sous-traitant, gamme). */
function LotEditForm({ info, onClose }: { info: BatchDTO; onClose: () => void }) {
  const { routes, run, t, pending } = useApp();
  const poRef = useRef<HTMLInputElement>(null);
  const projRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);
  const [routeId, setRouteId] = useState(
    info.routeId || routes.find((r) => r.isDefault)?.id || routes[0]?.id || "",
  );

  const save = async () => {
    const res = await run(
      updateBatchAction({
        batchId: info.id,
        po: poRef.current?.value,
        projet: projRef.current?.value,
        reference: refRef.current?.value,
        sub: subRef.current?.value,
        routeId,
      }),
      t.saved,
    );
    if (res.ok) onClose();
  };

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="m-0 mb-2 text-xs uppercase tracking-wider text-muted-foreground">
        {t.editLotTitle}
      </p>
      <div className="flex flex-wrap items-end gap-2.5">
        <Field label={t.poField}>
          <input ref={poRef} defaultValue={info.po} className={inputCls + " w-[150px]"} />
        </Field>
        <Field label={t.proj}>
          <input ref={projRef} defaultValue={info.projet} className={inputCls + " w-[130px]"} />
        </Field>
        <Field label={t.ref}>
          <input ref={refRef} defaultValue={info.reference} className={inputCls + " w-[90px]"} />
        </Field>
        <Field label={t.sub}>
          <input ref={subRef} defaultValue={info.sub} className={inputCls + " w-[150px]"} />
        </Field>
        <Field label={t.route}>
          <select
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            className={inputCls + " w-[150px]"}
          >
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          onClick={save}
          disabled={pending}
          className="self-end rounded-[9px] bg-amber px-[17px] py-[11px] font-bold text-[#16181a] hover:bg-amber-bright disabled:opacity-60"
        >
          {t.save}
        </button>
        <button
          onClick={onClose}
          className="self-end rounded-[9px] border border-line bg-transparent px-[17px] py-[11px] font-bold hover:border-amber hover:text-amber"
        >
          {t.cancel}
        </button>
      </div>
      <p className="m-0 mt-2 text-xs text-muted-foreground">{t.editLotRouteHint}</p>
    </div>
  );
}

/* ===================== Rapports ===================== */
function ViewRep() {
  const { units, deliveries, t, lang } = useApp();
  const counts: Record<string, number> = {};
  units.forEach((u) => {
    if (u.livraison) counts[u.livraison] = (counts[u.livraison] || 0) + 1;
  });
  const list = [...deliveries].sort((a, b) => (b.id || "").localeCompare(a.id || ""));

  if (!list.length)
    return (
      <>
        <SectionHeader title={t.repTitle} lead={t.repLead} />
        <EmptyState>{t.repNone}</EmptyState>
      </>
    );

  return (
    <>
      <SectionHeader title={t.repTitle} lead={t.repLead} />
      <div className="flex flex-col gap-2">
        {list.map((d) => {
          const n = counts[d.id] || 0;
          return (
            <div
              key={d.id}
              className="grid items-center gap-3.5 rounded-xl border border-line bg-panel px-4 py-3.5 [grid-template-columns:1.5fr_1fr_auto]"
            >
              <div>
                <b className="text-base">{d.id}</b>
                <br />
                <span className="font-mono text-xs text-muted-foreground">
                  {d.client || "—"} · {n} {t.units}
                </span>
              </div>
              <div>
                <span className={`chip ${d.closed ? "chip-livre" : "chip-pret"}`}>
                  {d.closed ? t.closedL : t.openL}
                </span>
              </div>
              <div>
                <button
                  onClick={() => {
                    const out = printSlip(d.id, units, deliveries, t, lang);
                    if (!out.ok && out.message) toast.error(out.message);
                  }}
                  className="rounded-[9px] bg-amber px-3 py-2 text-[13px] font-bold text-[#16181a] hover:bg-amber-bright"
                >
                  {t.printSlip}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ===================== Paramètres ===================== */
function ViewSet() {
  const { units, settings, ui, run, t, pending } = useApp();
  const subRef = useRef<HTMLInputElement>(null);
  const projRef = useRef<HTMLInputElement>(null);
  const [newPerson, setNewPerson] = useState("");

  if (ui.client)
    return (
      <>
        <SectionHeader title={t.setTitle} lead={t.setLead} />
        <EmptyState>{t.clientReadonly}</EmptyState>
      </>
    );

  const c: Record<string, number> = {
    montage: 0, test: 0, verification: 0, pret: 0, livre: 0, rejet: 0,
  };
  units.forEach((u) => c[statut(u)]++);
  const en = c.montage + c.test + c.verification + c.pret;

  // Persiste sub/proj/ops ensemble (saveSettings remplace la liste d'opérateurs).
  const persist = (ops: string[], msg?: string) =>
    run(
      saveSettingsAction({
        sub: subRef.current?.value ?? settings.sub,
        proj: projRef.current?.value ?? settings.proj,
        ops,
      }),
      msg,
    );

  const saveDefaults = () => persist(settings.ops, t.saved);

  const addPerson = async () => {
    const name = newPerson.trim();
    if (!name) return;
    if (settings.ops.some((o) => o.toLowerCase() === name.toLowerCase())) {
      toast.error(t.dupPerson);
      return;
    }
    const res = await persist([...settings.ops, name], t.personAdded);
    if (res.ok) setNewPerson("");
  };

  const removePerson = (name: string) =>
    persist(settings.ops.filter((o) => o !== name), t.personRemoved);

  return (
    <>
      <SectionHeader title={t.setTitle} lead={t.setLead} />
      <div className="mb-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Stat n={c.livre} l={t.statConforme} />
        <Stat n={en} l={t.statEnCours} />
        <Stat n={c.rejet} l={t.statRejet} rej />
        <Stat n={units.length} l={t.statTotal} />
      </div>

      <div className="grid items-start gap-6 [grid-template-columns:1fr_1fr] max-[680px]:[grid-template-columns:1fr]">
        {/* Défauts */}
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap gap-2.5">
            <Field label={t.defSub}>
              <input ref={subRef} defaultValue={settings.sub} className={inputCls} />
            </Field>
            <Field label={t.defProj}>
              <input ref={projRef} defaultValue={settings.proj} className={inputCls} />
            </Field>
          </div>
          <div>
            <button
              onClick={saveDefaults}
              disabled={pending}
              className="rounded-[9px] bg-amber px-[17px] py-[11px] font-bold text-[#16181a] hover:bg-amber-bright disabled:opacity-60"
            >
              {t.save}
            </button>
          </div>
        </div>

        {/* Personnes (opérateurs) */}
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            {t.operatorsHeading}
          </p>
          <div className="mb-2.5 flex gap-2">
            <input
              value={newPerson}
              onChange={(e) => setNewPerson(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addPerson();
                }
              }}
              placeholder={t.personName}
              className={inputCls + " flex-1"}
            />
            <button
              onClick={addPerson}
              disabled={pending || !newPerson.trim()}
              className="rounded-[9px] bg-amber px-4 py-2.5 font-bold text-[#16181a] hover:bg-amber-bright disabled:opacity-50"
            >
              {t.addPerson}
            </button>
          </div>
          {settings.ops.length ? (
            <div className="flex flex-col gap-1.5">
              {settings.ops.map((o) => (
                <div
                  key={o}
                  className="flex items-center justify-between rounded-[10px] border border-line bg-panel px-3.5 py-2.5"
                >
                  <span className="font-bold">{o}</span>
                  <button
                    onClick={() => removePerson(o)}
                    disabled={pending}
                    className="rounded-md border border-line px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-fail hover:text-fail disabled:opacity-50"
                  >
                    {t.removePerson}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>{t.noPersons}</EmptyState>
          )}
        </div>
      </div>

      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-faint">
        {t.iso}
      </p>
    </>
  );
}

function Stat({ n, l, rej }: { n: number; l: string; rej?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-[17px] py-[15px]">
      <div className={cn("font-mono text-[28px] font-bold", rej && "text-fail")}>{n}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{l}</div>
    </div>
  );
}

/* ===================== util ===================== */
function fmt(iso: string | null, none: string) {
  if (!iso) return none;
  const d = new Date(iso);
  return d.toLocaleString("fr-CA", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
