"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useApp } from "./app-context";

/**
 * Instructions de poste — essais électriques PAN 003 (IT-ELEC-PAN003 Rév. A).
 * Reprend la structure du document d'instruction officiel : carte par essai
 * (numéro, titre FR/EN, outil requis, étapes illustrées, critères ACCEPT/REFUS).
 * Les cartes restent claires (fiche imprimée) à l'intérieur du panneau sombre,
 * comme l'instruction affichée au poste.
 */

/* ---- Pictos communs ---- */

function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d="M3 12h16m-6-6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OkIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r="16" fill="#fff" stroke="#1f9d57" strokeWidth="2.5" />
      <path
        d="M11 18l5 5 9-11"
        fill="none"
        stroke="#1f9d57"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NoIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r="16" fill="#fff" stroke="#d23b3b" strokeWidth="2.5" />
      <path
        d="M12 12l12 12M24 12L12 24"
        fill="none"
        stroke="#d23b3b"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      style={{ verticalAlign: "-2px", marginRight: 3 }}
    >
      <path
        d="M20 12a8 8 0 11-2.3-5.6"
        fill="none"
        stroke="#d23b3b"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M18 2v6h-6"
        fill="none"
        stroke="#d23b3b"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---- Blocs de structure ---- */

function Step({
  n,
  pic,
  fr,
  en,
}: {
  n: number;
  pic: React.ReactNode;
  fr: React.ReactNode;
  en: string;
}) {
  return (
    <div className="relative min-w-[120px] flex-1 px-2 py-1 text-center">
      <span className="absolute -top-0.5 left-1/2 flex h-[22px] w-[22px] -translate-x-1/2 items-center justify-center rounded-full bg-[#f5a623] text-xs font-extrabold text-[#15181b]">
        {n}
      </span>
      <div className="mb-2 mt-[18px] flex h-16 items-center justify-center">{pic}</div>
      <div className="text-xs leading-tight">
        <span className="block text-[12.5px] font-bold">{fr}</span>
        <span className="italic text-[#5b636b]">{en}</span>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden w-[26px] shrink-0 items-center justify-center self-center text-[#b6bdc4] sm:flex">
      <ArrowIcon />
    </div>
  );
}

function Results({
  okFr,
  okEn,
  noFr,
  noEn,
  fixFr,
  fixEn,
}: {
  okFr: string;
  okEn: string;
  noFr: string;
  noEn: string;
  fixFr: string;
  fixEn: string;
}) {
  return (
    <div className="grid gap-2.5 px-4 pb-4 pt-1.5 sm:grid-cols-2">
      <div className="flex items-start gap-3 rounded-[11px] border-[1.5px] border-[#bfe6cd] bg-[#e6f6ec] px-3.5 py-3">
        <OkIcon />
        <div>
          <div className="mb-0.5 text-[13px] font-extrabold tracking-[0.06em] text-[#1f9d57]">
            ACCEPT · PASS
          </div>
          <span className="text-[13px] font-bold">{okFr}</span>
          <br />
          <span className="text-xs italic text-[#5b636b]">{okEn}</span>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-[11px] border-[1.5px] border-[#f3c2c2] bg-[#fdeaea] px-3.5 py-3">
        <NoIcon />
        <div>
          <div className="mb-0.5 text-[13px] font-extrabold tracking-[0.06em] text-[#d23b3b]">
            REFUS · FAIL
          </div>
          <span className="text-[13px] font-bold">{noFr}</span>
          <br />
          <span className="text-xs italic text-[#5b636b]">{noEn}</span>
          <div className="mt-1 text-[11.5px] text-[#d23b3b]">
            <RetryIcon />
            {fixFr} · {fixEn}
          </div>
        </div>
      </div>
    </div>
  );
}

function TestCard({
  n,
  titleFr,
  titleEn,
  role,
  tool,
  toolFr,
  toolEn,
  children,
}: {
  n: number;
  titleFr: string;
  titleEn: string;
  role: string;
  tool: React.ReactNode;
  toolFr: string;
  toolEn: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#d8dde2] bg-white text-[#15181b]">
      <div className="flex items-stretch border-b border-[#d8dde2]">
        <div className="flex w-[72px] shrink-0 flex-col items-center justify-center gap-0.5 bg-[#15181b] text-white">
          <span className="text-[34px] font-extrabold leading-none">{n}</span>
          <span className="text-[10px] tracking-[0.18em] text-[#f5a623]">TEST</span>
        </div>
        <div className="flex flex-1 flex-col justify-center px-4 py-3">
          <span className="text-[19px] font-bold leading-tight">{titleFr}</span>
          <span className="text-sm italic text-[#5b636b]">{titleEn}</span>
          <span className="mt-1 text-xs text-[#5b636b]">{role}</span>
        </div>
        <div className="hidden w-[210px] shrink-0 items-center gap-3 border-l border-[#d8dde2] bg-[#fafbfc] px-3.5 py-2.5 md:flex">
          {tool}
          <div className="text-[11.5px] leading-tight">
            <span className="text-[12.5px] font-bold">{toolFr}</span>
            <br />
            <small className="italic text-[#5b636b]">{toolEn}</small>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ---- Fils noir/blanc (essai 1) ---- */
function Sw({ kind }: { kind: "bk" | "wt" }) {
  return (
    <span
      className="mx-0.5 inline-block h-2.5 w-2.5 rounded-[2px] align-baseline"
      style={
        kind === "bk"
          ? { background: "#15181b", border: "1px solid #15181b" }
          : { background: "#fff", border: "1.5px solid #777" }
      }
    />
  );
}

/* ---- Les 3 cartes ---- */

function Test1() {
  return (
    <TestCard
      n={1}
      titleFr="DIÉLECTRIQUE"
      titleEn="DIELECTRIC — high-voltage / short to ground"
      role="Cherche un court-circuit à la terre · Looks for a short to ground"
      toolFr="Testeur diélectrique"
      toolEn="Dielectric tester — 1,5 kV (ex. Criterion AV-25V-10)"
      tool={
        <svg width="74" height="58" viewBox="0 0 90 70" className="shrink-0">
          <rect x="6" y="10" width="58" height="50" rx="5" fill="#fff" stroke="#15181b" strokeWidth="2.5" />
          <circle cx="26" cy="30" r="11" fill="#fafbfc" stroke="#15181b" strokeWidth="2" />
          <path d="M26 30l6-6" stroke="#d23b3b" strokeWidth="2" strokeLinecap="round" />
          <circle cx="48" cy="24" r="4.5" fill="#fff" stroke="#15181b" strokeWidth="2" />
          <rect x="14" y="46" width="40" height="7" rx="3.5" fill="#15181b" />
          <path d="M64 22c14 0 14 8 24 6" fill="none" stroke="#15181b" strokeWidth="2.5" />
          <path d="M64 40c14 0 14 10 24 12" fill="none" stroke="#d23b3b" strokeWidth="2.5" />
        </svg>
      }
    >
      <div className="flex flex-wrap items-stretch px-3.5 pb-1.5 pt-4">
        <Step
          n={1}
          fr="Régler 1,5 kV"
          en="Set 1.5 kV"
          pic={
            <svg width="62" height="62" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="20" fill="none" stroke="#15181b" strokeWidth="3" />
              <path d="M32 32l11-8" stroke="#d23b3b" strokeWidth="3" strokeLinecap="round" />
              <circle cx="32" cy="32" r="3.5" fill="#15181b" />
            </svg>
          }
        />
        <Arrow />
        <Step
          n={2}
          fr="Pince noire → TERRE"
          en="Black clip → GROUND"
          pic={
            <svg width="64" height="62" viewBox="0 0 72 64">
              <path d="M6 26h20l6-5v18l-6-5H6z" fill="#15181b" />
              <path d="M26 30h14" stroke="#15181b" strokeWidth="2.5" />
              <path d="M40 20v24M34 47h12M37 50h6M39 53h2" stroke="#1f9d57" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          }
        />
        <Arrow />
        <Step
          n={3}
          fr={
            <>
              Sonde rouge → fil <Sw kind="bk" />
              NOIR + <Sw kind="wt" />
              BLANC
            </>
          }
          en="Red probe → BLACK + WHITE wire"
          pic={
            <svg width="64" height="62" viewBox="0 0 72 64">
              <rect x="10" y="18" width="34" height="30" rx="4" fill="#fafbfc" stroke="#15181b" strokeWidth="2.5" />
              <circle cx="21" cy="33" r="4.5" fill="#15181b" />
              <circle cx="34" cy="33" r="4.5" fill="#fff" stroke="#15181b" strokeWidth="2.5" />
              <path d="M58 12l-14 18" stroke="#d23b3b" strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="44" cy="30" r="3" fill="#d23b3b" />
            </svg>
          }
        />
        <Arrow />
        <Step
          n={4}
          fr="Observer le testeur"
          en="Watch the tester"
          pic={
            <svg width="62" height="62" viewBox="0 0 64 64">
              <circle cx="32" cy="28" r="16" fill="none" stroke="#15181b" strokeWidth="3" />
              <circle cx="32" cy="28" r="2.5" fill="#15181b" />
              <path d="M32 28l9-6" stroke="#15181b" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M22 52h20" stroke="#15181b" strokeWidth="3" strokeLinecap="round" />
            </svg>
          }
        />
      </div>
      <Results
        okFr="Aucun déclenchement"
        okEn="No trip / no alarm"
        noFr="Déclenchement = court-circuit"
        noEn="Trip = short circuit"
        fixFr="Réparer puis reprendre l'essai"
        fixEn="Repair, then retest"
      />
    </TestCard>
  );
}

function Test2() {
  return (
    <TestCard
      n={2}
      titleFr="POLARITÉ"
      titleEn="POLARITY — circuit integrity / direction"
      role="Vérifie que le câblage de la prise est correct · Checks the outlet wiring is correct"
      toolFr="Vérificateur de prise"
      toolEn="Outlet tester, 95–125 V (ex. Mastercraft)"
      tool={
        <svg width="64" height="58" viewBox="0 0 64 70" className="shrink-0">
          <rect x="16" y="8" width="32" height="44" rx="6" fill="#fff" stroke="#15181b" strokeWidth="2.5" />
          <circle cx="26" cy="20" r="3.2" fill="#ffcf4d" stroke="#15181b" strokeWidth="1.4" />
          <circle cx="38" cy="20" r="3.2" fill="#ffcf4d" stroke="#15181b" strokeWidth="1.4" />
          <circle cx="32" cy="30" r="3.2" fill="#e7e9ec" stroke="#15181b" strokeWidth="1.4" />
          <path d="M27 52v9M37 52v9" stroke="#15181b" strokeWidth="3" strokeLinecap="round" />
          <path d="M32 52v12" stroke="#15181b" strokeWidth="3" strokeLinecap="round" />
        </svg>
      }
    >
      <div className="flex flex-wrap items-stretch px-3.5 pb-1.5 pt-4">
        <Step
          n={1}
          fr="Brancher la prise sur 120 V"
          en="Connect outlet to 120 V"
          pic={
            <svg width="64" height="62" viewBox="0 0 72 64">
              <rect x="14" y="16" width="32" height="32" rx="5" fill="#fafbfc" stroke="#15181b" strokeWidth="2.5" />
              <rect x="24" y="24" width="4" height="9" fill="#15181b" />
              <rect x="33" y="24" width="4" height="9" fill="#15181b" />
              <circle cx="30.5" cy="40" r="2.5" fill="#15181b" />
              <path d="M54 22v20" stroke="#d23b3b" strokeWidth="3" strokeLinecap="round" />
              <text x="50" y="58" fontSize="11" fontWeight="700" fontFamily="Arial">
                120V
              </text>
            </svg>
          }
        />
        <Arrow />
        <Step
          n={2}
          fr="Insérer le vérificateur"
          en="Plug in the outlet tester"
          pic={
            <svg width="58" height="62" viewBox="0 0 64 64">
              <rect x="22" y="6" width="22" height="32" rx="5" fill="#fff" stroke="#15181b" strokeWidth="2.5" />
              <circle cx="29" cy="15" r="2.6" fill="#ffcf4d" />
              <circle cx="37" cy="15" r="2.6" fill="#ffcf4d" />
              <path d="M30 38v12M37 38v12" stroke="#15181b" strokeWidth="3" strokeLinecap="round" />
              <rect x="18" y="50" width="30" height="10" rx="3" fill="#fafbfc" stroke="#15181b" strokeWidth="2" />
            </svg>
          }
        />
        <Arrow />
        <Step
          n={3}
          fr="Lire les voyants"
          en="Read the indicator lights"
          pic={
            <svg width="62" height="62" viewBox="0 0 64 64">
              <circle cx="20" cy="26" r="7" fill="#ffcf4d" stroke="#15181b" strokeWidth="2" />
              <circle cx="38" cy="26" r="7" fill="#ffcf4d" stroke="#15181b" strokeWidth="2" />
              <path d="M16 44h32" stroke="#15181b" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M50 18l4 4-4 4" stroke="#15181b" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3.5">
        <div className="flex items-center gap-2 rounded-[9px] border border-[#bfe6cd] bg-[#e6f6ec] px-2.5 py-1.5 text-xs">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="#fff" stroke="#1f9d57" strokeWidth="2" />
            <path d="M7 12l3 3 6-7" fill="none" stroke="#1f9d57" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <b>CORRECT</b> — comme sur l&apos;outil · as on the tool
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-[9px] border border-[#f3c2c2] bg-[#fdeaea] px-2.5 py-1.5 text-xs">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="#fff" stroke="#d23b3b" strokeWidth="2" />
            <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="#d23b3b" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span>
            <b>Tout autre motif</b> · Any other pattern
          </span>
        </div>
        <div className="min-w-[170px] flex-1 text-[11.5px] text-[#5b636b]">
          <span className="font-bold text-[#15181b]">
            Comparer à la légende imprimée sur l&apos;outil — seul « CORRECT » est accepté.
          </span>{" "}
          <span className="italic">Compare to the legend printed on the tool.</span>
        </div>
      </div>
      <Results
        okFr="Voyants = « CORRECT »"
        okEn="Lights show “CORRECT”"
        noFr="Tout autre motif"
        noEn="Any other pattern"
        fixFr="Corriger le câblage puis reprendre"
        fixEn="Fix wiring, then retest"
      />
    </TestCard>
  );
}

function Test3() {
  return (
    <TestCard
      n={3}
      titleFr="EFFORT DE RACCORD"
      titleEn="PULL STRENGTH — connection tightness"
      role="La prise ne doit pas être trop lâche · The outlet must not be too loose"
      toolFr="Jauge d'effort / tension"
      toolEn="Pull-force gauge — ≥ 16 oz"
      tool={
        <svg width="74" height="50" viewBox="0 0 96 60" className="shrink-0">
          <rect x="20" y="18" width="40" height="24" rx="5" fill="#fff" stroke="#15181b" strokeWidth="2.5" />
          <circle cx="32" cy="30" r="6" fill="#fafbfc" stroke="#15181b" strokeWidth="1.8" />
          <circle cx="48" cy="30" r="6" fill="#fafbfc" stroke="#15181b" strokeWidth="1.8" />
          <path d="M8 26h12M8 34h12" stroke="#15181b" strokeWidth="3" strokeLinecap="round" />
          <path d="M60 30h22m-7-6l7 6-7 6" fill="none" stroke="#d23b3b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    >
      <div className="flex flex-wrap items-stretch px-3.5 pb-1.5 pt-4">
        <Step
          n={1}
          fr="Insérer les broches"
          en="Insert the prongs"
          pic={
            <svg width="64" height="62" viewBox="0 0 72 64">
              <rect x="14" y="18" width="30" height="28" rx="5" fill="#fafbfc" stroke="#15181b" strokeWidth="2.5" />
              <rect x="23" y="26" width="4" height="8" fill="#15181b" />
              <rect x="31" y="26" width="4" height="8" fill="#15181b" />
              <path d="M44 26h16M44 38h16" stroke="#15181b" strokeWidth="3" strokeLinecap="round" />
            </svg>
          }
        />
        <Arrow />
        <Step
          n={2}
          fr="Tirer et lire la force"
          en="Pull and read the force"
          pic={
            <svg width="66" height="62" viewBox="0 0 76 64">
              <rect x="8" y="20" width="28" height="24" rx="5" fill="#fff" stroke="#15181b" strokeWidth="2.5" />
              <circle cx="22" cy="32" r="7" fill="none" stroke="#15181b" strokeWidth="2" />
              <path d="M22 32l5-3" stroke="#15181b" strokeWidth="2" strokeLinecap="round" />
              <path d="M36 32h30m-9-7l9 7-9 7" fill="none" stroke="#d23b3b" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <Arrow />
        <Step
          n={3}
          fr="Seuil : 16 oz (≈ 0,45 kg)"
          en="Threshold: 16 oz"
          pic={
            <svg width="64" height="62" viewBox="0 0 72 64">
              <path d="M12 44h48" stroke="#15181b" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M24 44V24M48 44V18" stroke="#15181b" strokeWidth="2.5" strokeLinecap="round" />
              <rect x="38" y="10" width="22" height="13" rx="3" fill="#e6f6ec" stroke="#1f9d57" strokeWidth="2" />
              <text x="41" y="20" fontSize="9.5" fontWeight="800" fontFamily="Arial" fill="#1f9d57">
                16 oz
              </text>
            </svg>
          }
        />
      </div>
      <Results
        okFr="16 oz et plus"
        okEn="16 oz or more"
        noFr="Moins de 16 oz = trop lâche"
        noEn="Under 16 oz = too loose"
        fixFr="Réparer puis reprendre"
        fixEn="Repair, then retest"
      />
    </TestCard>
  );
}

/* ---- Bouton + panneau ---- */

export function TestInstructions() {
  const [open, setOpen] = useState(false);
  const { t } = useApp();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-[10px] border border-line px-4 py-[11px] text-sm font-bold hover:border-amber hover:text-amber"
      >
        📋 {t.testInstructions}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full gap-0 overflow-y-auto border-line bg-background data-[side=right]:sm:max-w-[760px]">
          <SheetHeader className="border-b border-line">
            <SheetTitle>{t.testInstructionsTitle}</SheetTitle>
            <p className="m-0 text-xs text-muted-foreground">{t.testInstructionsLead}</p>
          </SheetHeader>
          <div className="flex flex-col gap-3.5 p-4">
            <Test1 />
            <Test2 />
            <Test3 />
            <p className="m-0 px-1 text-[11px] text-muted-foreground">
              <b className="tracking-[0.03em]">IT-ELEC-PAN003</b> · Rév. A · 2026-06-25 — ISO 9001
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
