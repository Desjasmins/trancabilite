"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { signIn } from "@/lib/auth-client";
import { inputCls, Field } from "./atelier";

export function LoginGate() {
  const { t } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      toast.error(t.loginError);
      return;
    }
    router.refresh();
  };

  return (
    <div className="mx-auto mt-10 max-w-[380px] rounded-2xl border border-line bg-panel p-7">
      <h2 className="text-lg font-semibold">{t.login}</h2>
      <p className="mb-5 mt-0.5 text-sm text-muted-foreground">{t.bureauLocked}</p>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label={t.emailLbl}>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls + " w-full"}
            required
          />
        </Field>
        <Field label={t.passwordLbl}>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls + " w-full"}
            required
          />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-[9px] bg-amber px-[17px] py-[11px] font-bold text-[#16181a] hover:bg-amber-bright disabled:opacity-60"
        >
          {t.signInBtn}
        </button>
      </form>
    </div>
  );
}
