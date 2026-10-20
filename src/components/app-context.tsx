"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { toast } from "sonner";
import { useLang } from "./lang-provider";
import { errorMessage } from "@/lib/access/errors";
import type { ActionResult } from "@/app/actions";
import { notifyChange } from "@/lib/realtime";
import { useLiveSync } from "./use-live-sync";
import type {
  Snapshot,
  UnitDTO,
  BatchDTO,
  DeliveryDTO,
  SettingsDTO,
  LabelTemplate,
  StationKey,
  TestResult,
  StatusKey,
  LabelElementKey,
  OperationDTO,
  RouteDTO,
  AuthUser,
} from "@/lib/types";
import type { Dict, Lang } from "@/lib/i18n";

export interface PendingTest {
  diel: TestResult;
  pol: TestResult;
  eff: TestResult;
  visual: TestResult;
}

export interface UiState {
  mode: "atelier" | "bureau";
  station: StationKey | null;
  /** Onglet Atelier « Cet écran » (#4). */
  screen: boolean;
  op: Partial<Record<string, string>>;
  scanUnit: string | null;
  verifArm: boolean;
  pendingTest: PendingTest;
  client: boolean;
  bureauTab: "reg" | "lots" | "rep" | "label" | "set" | "kiosks";
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
  screen: false,
  op: {},
  scanUnit: null,
  verifArm: false,
  pendingTest: { diel: null, pol: null, eff: null, visual: null },
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
  batches: BatchDTO[];
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
  user: AuthUser | null;
  /** Garde de l'atelier inactive (#5) : vrai seulement pour un admin, calculé au serveur. */
  floorGuardOff: boolean;
}

const Ctx = createContext<AppCtxValue | null>(null);

export function AppProvider({
  initial,
  user,
  live = true,
  floorGuardOff = false,
  children,
}: {
  initial: Snapshot;
  user: AuthUser | null;
  /** false : aucune synchro (porte sans identité, #5). */
  live?: boolean;
  floorGuardOff?: boolean;
  children: React.ReactNode;
}) {
  const { t, lang, setLang } = useLang();
  const [units, setUnits] = useState<UnitDTO[]>(initial.units);
  const [batches, setBatches] = useState<BatchDTO[]>(initial.batches);
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
    if (res.batches) setBatches(res.batches);
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
          // Codes (AUTH_REQUIRED, FORBIDDEN, GENERIC) traduits ; message métier tel quel (#3).
          toast.error(errorMessage(res.error, t));
          return res;
        }
        applyResult(res);
        notifyChange(); // signale aux autres écrans
        if (successMsg) {
          if (bad) toast.error(successMsg);
          else toast.success(successMsg);
        }
        return res;
      } catch {
        // L'appel n'a pas abouti (réseau, serveur injoignable) : jamais le message brut.
        toast.error(t.errors.network);
        return { ok: false, error: t.errors.network } as ActionResult;
      } finally {
        setPending(false);
      }
    },
    [applyResult, t],
  );

  useLiveSync(live, applyResult);

  return (
    <Ctx.Provider
      value={{
        units,
        batches,
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
        user,
        floorGuardOff,
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
