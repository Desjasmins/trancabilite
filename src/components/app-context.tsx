"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { toast } from "sonner";
import { useLang } from "./lang-provider";
import type { ActionResult } from "@/app/actions";
import type {
  Snapshot,
  UnitDTO,
  DeliveryDTO,
  SettingsDTO,
  LabelTemplate,
  StationKey,
  TestResult,
  StatusKey,
  LabelElementKey,
  OperationDTO,
  RouteDTO,
} from "@/lib/types";
import type { Dict, Lang } from "@/lib/i18n";

export interface PendingTest {
  diel: TestResult;
  pol: TestResult;
  eff: TestResult;
}

export interface UiState {
  mode: "atelier" | "bureau";
  station: StationKey | null;
  op: Partial<Record<string, string>>;
  scanUnit: string | null;
  verifArm: boolean;
  pendingTest: PendingTest;
  client: boolean;
  bureauTab: "reg" | "lots" | "rep" | "label" | "set";
  query: string;
  filterStatus: StatusKey | "";
  activeDelivery: string;
  lastCreated: string[];
  openId: string | null;
  selPart: LabelElementKey | "code";
}

const initialUi: UiState = {
  mode: "atelier",
  station: null,
  op: {},
  scanUnit: null,
  verifArm: false,
  pendingTest: { diel: null, pol: null, eff: null },
  client: false,
  bureauTab: "reg",
  query: "",
  filterStatus: "",
  activeDelivery: "",
  lastCreated: [],
  openId: null,
  selPart: "modele",
};

interface AppCtxValue {
  units: UnitDTO[];
  deliveries: DeliveryDTO[];
  settings: SettingsDTO;
  template: LabelTemplate;
  setTemplate: (t: LabelTemplate) => void;
  operations: OperationDTO[];
  routes: RouteDTO[];
  ui: UiState;
  setUi: (partial: Partial<UiState>) => void;
  applyResult: (res: ActionResult) => void;
  run: (p: Promise<ActionResult>, successMsg?: string, bad?: boolean) => Promise<ActionResult>;
  t: Dict;
  lang: Lang;
  setLang: (l: Lang) => void;
  pending: boolean;
}

const Ctx = createContext<AppCtxValue | null>(null);

export function AppProvider({
  initial,
  children,
}: {
  initial: Snapshot;
  children: React.ReactNode;
}) {
  const { t, lang, setLang } = useLang();
  const [units, setUnits] = useState<UnitDTO[]>(initial.units);
  const [deliveries, setDeliveries] = useState<DeliveryDTO[]>(initial.deliveries);
  const [settings, setSettings] = useState<SettingsDTO>(initial.settings);
  const [template, setTemplate] = useState<LabelTemplate>(initial.template);
  const [ui, setUiState] = useState<UiState>(initialUi);
  const [pending, setPending] = useState(false);

  const setUi = useCallback((partial: Partial<UiState>) => {
    setUiState((prev) => ({ ...prev, ...partial }));
  }, []);

  const applyResult = useCallback((res: ActionResult) => {
    if (res.units) setUnits(res.units);
    if (res.deliveries) setDeliveries(res.deliveries);
    if (res.settings) setSettings(res.settings);
    if (res.template) setTemplate(res.template);
  }, []);

  const run = useCallback(
    async (p: Promise<ActionResult>, successMsg?: string, bad?: boolean) => {
      setPending(true);
      try {
        const res = await p;
        if (!res.ok) {
          toast.error(res.error ?? "Erreur");
          return res;
        }
        applyResult(res);
        if (successMsg) {
          if (bad) toast.error(successMsg);
          else toast.success(successMsg);
        }
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur réseau";
        toast.error(msg);
        return { ok: false, error: msg } as ActionResult;
      } finally {
        setPending(false);
      }
    },
    [applyResult],
  );

  return (
    <Ctx.Provider
      value={{
        units,
        deliveries,
        settings,
        template,
        setTemplate,
        operations: initial.operations,
        routes: initial.routes,
        ui,
        setUi,
        applyResult,
        run,
        t,
        lang,
        setLang,
        pending,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used within AppProvider");
  return c;
}
