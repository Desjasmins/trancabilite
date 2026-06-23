"use client";

import { useLang } from "./lang-provider";
import type { StatusKey, TestResult } from "@/lib/types";

export function StatusChip({ s }: { s: StatusKey }) {
  const { t } = useLang();
  return <span className={`chip chip-${s}`}>{t.st[s]}</span>;
}

export function TestDot({ v }: { v: TestResult }) {
  const cls = v === "accept" ? "tcdot-a" : v === "refus" ? "tcdot-r" : "tcdot-n";
  return <span className={`tcdot ${cls}`} />;
}

export function SectionHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {lead ? <p className="mt-0.5 text-sm text-muted-foreground">{lead}</p> : null}
    </div>
  );
}

export function QHeader({ label }: { label: string }) {
  return (
    <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-5 py-12 text-center text-muted-foreground">
      {children}
    </div>
  );
}
