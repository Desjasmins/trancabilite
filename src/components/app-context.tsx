"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useLang } from "./lang-provider";
import { getLiveDataAction, type ActionResult } from "@/app/actions";
import { subscribeSync, notifyChange, realtimeEnabled } from "@/lib/realtime";
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
}

const Ctx = createContext<AppCtxValue | null>(null);

export function AppProvider({
  initial,
  user,
  children,
}: {
  initial: Snapshot;
  user: AuthUser | null;
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
          toast.error(res.error ?? "Erreur");
          return res;
        }
        applyResult(res);
        notifyChange(); // signale aux autres écrans
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

  // Synchro live : signal temps réel + filets de sécurité pour qu'aucun écran
  // ne reste périmé sans action de l'utilisateur.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      void getLiveDataAction().then((res) => {
        if (res.ok) applyResult(res);
      });
    };
    // Groupe les signaux rapprochés (plusieurs actions en rafale -> 1 rechargement).
    const onSignal = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refresh, 200);
    };

    // 1) Temps réel : un autre écran a changé une donnée.
    const unsub = subscribeSync(onSignal);

    // 2) Onglet redevenu visible (veille, changement d'onglet) : des signaux
    //    ont pu être ratés pendant ce temps.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    // 3) Retour du réseau.
    window.addEventListener("online", refresh);

    // 4) Rafraîchissement périodique de secours (onglet visible seulement) :
    //    garantit la fraîcheur même si le temps réel est indisponible.
    const every = realtimeEnabled() ? 60_000 : 20_000;
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, every);

    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
    };
  }, [applyResult]);

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
