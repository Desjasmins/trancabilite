"use client";

import { useEffect } from "react";
import { useApp } from "./app-context";
import { Atelier } from "./atelier";
import { Bureau } from "./bureau";
import { queueFor } from "@/lib/status";
import { tryReconnectUSB } from "@/lib/usb";
import type { StationKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATION_ORDER: StationKey[] = [
  "etiquettes",
  "montage",
  "test",
  "verification",
  "emballage",
];

export function AppRoot() {
  const { units, template, ui, setUi, t, lang, setLang } = useApp();

  useEffect(() => {
    if ((template.print && template.print.method) === "zpl") void tryReconnectUSB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = {
    montage: queueFor(units, "montage").length,
    test: queueFor(units, "test").length,
    verification: queueFor(units, "verification").length,
    emballage: queueFor(units, "emballage").length,
  } as Record<string, number>;

  const bureauTabs: Array<[typeof ui.bureauTab, string]> = [
    ["reg", t.regTitle],
    ["lots", t.tabLots],
    ["rep", t.repTitle],
    ["label", t.tabLabel],
    ["set", t.setTitle],
  ];

  return (
    <>
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-4 border-b border-line bg-gradient-to-b from-[#1b1e21] to-[#16181a] px-[18px] py-3">
        <div className="flex items-center gap-[11px] font-bold tracking-[0.12em]">
          <span className="brand-mark" />
          LIGHTBASE
          <span className="border-l border-line pl-[11px] text-[12.5px] font-normal text-muted-foreground">
            {t.subtitle}
          </span>
        </div>
        <div className="flex-1" />

        {ui.mode === "bureau" && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber"
              checked={ui.client}
              onChange={(e) =>
                setUi({
                  client: e.target.checked,
                  openId: null,
                  bureauTab: ui.bureauTab === "set" && e.target.checked ? "reg" : ui.bureauTab,
                })
              }
            />
            {t.clientLbl}
          </label>
        )}

        <Toggle
          options={[
            ["atelier", t.mAtelier],
            ["bureau", t.mBureau],
          ]}
          value={ui.mode}
          onChange={(v) =>
            setUi({ mode: v as "atelier" | "bureau", station: null, scanUnit: null, openId: null })
          }
        />
        <Toggle
          options={[
            ["fr", "FR"],
            ["en", "EN"],
          ]}
          value={lang}
          onChange={(v) => setLang(v as "fr" | "en")}
        />
      </header>

      {/* ---- Nav ---- */}
      <nav className="sticky top-[53px] z-20 flex gap-1 overflow-x-auto border-b border-line bg-[#16181a] px-[14px]">
        {ui.mode === "atelier" ? (
          <>
            <NavBtn
              on={ui.station === null}
              onClick={() => setUi({ station: null, scanUnit: null })}
            >
              ⌂ {t.postes}
            </NavBtn>
            {STATION_ORDER.map((k) => (
              <NavBtn
                key={k}
                on={ui.station === k}
                onClick={() => setUi({ station: k, scanUnit: null, lastCreated: [] })}
              >
                {t.stations[k]}
                {counts[k] != null && (
                  <span className={cn("ml-1.5 text-xs font-normal text-faint", counts[k] && "text-amber")}>
                    {counts[k]}
                  </span>
                )}
              </NavBtn>
            ))}
          </>
        ) : (
          bureauTabs.map(([k, label]) => (
            <NavBtn
              key={k}
              on={ui.bureauTab === k}
              onClick={() => setUi({ bureauTab: k, openId: null })}
            >
              {label}
            </NavBtn>
          ))
        )}
      </nav>

      {/* ---- Main ---- */}
      <main className="mx-auto w-full max-w-[1120px] px-[18px] pb-24 pt-[22px]">
        {ui.mode === "atelier" ? <Atelier /> : <Bureau />}
      </main>
    </>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: Array<[string, string]>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-full border border-line text-[13px]">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={cn(
            "px-4 py-[7px] font-bold tracking-[0.04em] transition-colors",
            value === k ? "bg-amber text-[#16181a]" : "text-muted-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NavBtn({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "whitespace-nowrap border-b-2 px-4 py-[14px] text-sm font-bold tracking-[0.03em] transition-colors",
        on ? "border-amber text-foreground" : "border-transparent text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
