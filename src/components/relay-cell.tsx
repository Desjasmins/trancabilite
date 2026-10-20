"use client";

import { useApp } from "./app-context";
import { cn } from "@/lib/utils";

/** Date courte du registre (fr-CA), ou `none` si absente. */
export function fmt(iso: string | null, none: string) {
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

/** Case d'une étape dans la fiche d'unité du Bureau : qui, quand, depuis quel écran (#4). */
export function RelayCell({
  label,
  who,
  date,
  screen,
  bad,
}: {
  label: string;
  who: string | null;
  date: string | null;
  /** Écran d'atelier de l'événement (#4) ; null → « Écran non identifié ». */
  screen: string | null;
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
      {who && <div className="mt-0.5 text-[10px] text-faint">{screen || t.stationUnknown}</div>}
    </div>
  );
}
