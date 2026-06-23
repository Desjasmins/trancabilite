"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { I, type Lang, type Dict } from "@/lib/i18n";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr");

  useEffect(() => {
    const saved = localStorage.getItem("lb_lang");
    // Hydratation depuis localStorage : motif volontaire (valeur indisponible au SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "fr" || saved === "en") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("lb_lang", l);
  };

  return (
    <Ctx.Provider value={{ lang, setLang, t: I[lang] }}>{children}</Ctx.Provider>
  );
}

export function useLang() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLang must be used within LangProvider");
  return c;
}
