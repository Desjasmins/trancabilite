"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./app-context";
import { LoginGate } from "./login-gate";
import { signOut } from "@/lib/auth-client";
import {
  pairKioskAction, revokeKioskAction, renameKioskAction, listKiosksAction, type ActionResult,
} from "@/app/actions";
import { errorMessage } from "@/lib/access/errors";
import type { KioskDTO, ScreenState } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* ===================== Atelier : « Cet écran » ===================== */

/**
 * Onglet Atelier « Cet écran » (#4) : état de l'écran courant et, pour un admin connecté,
 * enregistrement. Rien n'est encore exigé : un écran non enregistré travaille comme avant.
 */
export function ThisScreen({ screen }: { screen: ScreenState }) {
  const { t, setUi, user } = useApp();
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>{t.tabThisScreen}</CardTitle>
        <ScreenStatus screen={screen} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {user?.role === "admin" && <PairForm />}
        {!user && (
          <Button size="lg" variant="outline" className="h-12"
            onClick={() => setUi({ mode: "bureau", station: null, screen: false })}>
            {t.stationUnpairedLogin}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ScreenStatus({ screen }: { screen: ScreenState }) {
  const { t } = useApp();
  if (screen.status === "paired") {
    return (
      <CardDescription>
        {t.stationPairedAs} <strong className="text-foreground">{screen.label}</strong>
      </CardDescription>
    );
  }
  if (screen.status === "revoked") return <CardDescription>{t.errors.KIOSK_REVOKED}</CardDescription>;
  return (
    <>
      <CardDescription className="font-bold text-foreground">{t.stationUnpairedTitle}</CardDescription>
      <CardDescription>{t.stationUnpairedBody}</CardDescription>
    </>
  );
}

function PairForm() {
  const { t, run, pending } = useApp();
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [confirming, setConfirming] = useState(false);
  const pair = async () => {
    setConfirming(false);
    const res = await run(pairKioskAction({ label }), t.stationPaired);
    // Le cookie vient d'être posé : le rendu serveur relit l'état de l'écran.
    if (res.ok) router.refresh();
  };
  return (
    <>
      <p className="text-sm text-muted-foreground">{t.stationPairWarn}</p>
      <Label htmlFor="kiosk-label">{t.stationLabel}</Label>
      <Input id="kiosk-label" value={label} maxLength={60} className="h-12 text-base"
        onChange={(e) => setLabel(e.target.value)} />
      <Button size="lg" className="h-12" disabled={pending || !label.trim()} onClick={() => setConfirming(true)}>
        {t.stationPairBtn}
      </Button>
      <PairConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={pair} />
    </>
  );
}

/** Confirmation avant l'appairage (tour 2) : l'appareil devient un écran d'atelier pour 400 jours. */
function PairConfirmDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useApp();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.stationPairBtn}</DialogTitle>
          <DialogDescription>{t.stationPairConfirm}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t.cancel}</DialogClose>
          <Button onClick={onConfirm}>{t.stationPairYes}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Page sans identité (#5) : ni écran appairé, ni compte autorisé à lire. Aucune donnée n'est
 * chargée ; l'état de l'écran (non enregistré ou révoqué) et la connexion.
 */
export function UnregisteredGate({ screen, signedIn = false }: { screen: ScreenState; signedIn?: boolean }) {
  return (
    <main className="mx-auto w-full max-w-xl px-[18px] pb-24 pt-[22px]">
      <Card>
        <CardHeader><ScreenStatus screen={screen} /></CardHeader>
        {signedIn && <CardContent><GateSignOut /></CardContent>}
      </Card>
      <LoginGate />
    </main>
  );
}

/** Compte connecté mais refusé (banni, rôle inconnu) : se déconnecter pour changer de compte. */
function GateSignOut() {
  const { t } = useApp();
  const router = useRouter();
  const out = async () => {
    await signOut();
    router.refresh();
  };
  return <Button variant="outline" size="lg" className="h-12 w-full" onClick={out}>{t.gateSignOut}</Button>;
}

/** Bandeau Admin (#5) tant que la garde de l'atelier est inactive (drapeau serveur éteint). */
export function FloorGuardBanner() {
  const { t } = useApp();
  return (
    <Card role="status" className="border-amber">
      <CardContent className="text-sm font-bold text-amber">{t.floorGuardOff}</CardContent>
    </Card>
  );
}

/* ===================== Bureau : « Écrans d'atelier » ===================== */

/** Liste chargée au montage ; `apply` la remplace par celle que rend une action. */
function useKiosks() {
  const { t } = useApp();
  const [kiosks, setKiosks] = useState<KioskDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void listKiosksAction().then((res) => {
      if (!live) return;
      if (res.ok) setKiosks(res.kiosks ?? []);
      else setLoadError(errorMessage(res.error, t));
    });
    return () => {
      live = false;
    };
  }, [t]);
  const apply = (res: ActionResult) => {
    if (res.ok && res.kiosks) setKiosks(res.kiosks);
  };
  return { kiosks, loadError, apply };
}

/** Onglet Bureau « Écrans d'atelier » (#4, admin) : liste, renommer, retirer l'accès. */
export function KioskList() {
  const { t, run, floorGuardOff } = useApp();
  const { kiosks, loadError, apply } = useKiosks();
  const [revoking, setRevoking] = useState<KioskDTO | null>(null);
  const [renaming, setRenaming] = useState<KioskDTO | null>(null);
  const revoke = async (id: string) => {
    setRevoking(null);
    apply(await run(revokeKioskAction({ id }), t.stationRevoked));
  };
  const rename = async (id: string, label: string) => {
    setRenaming(null);
    apply(await run(renameKioskAction({ id, label }), t.saved));
  };
  return (
    <Card>
      <CardHeader><CardTitle>{t.tabStations}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {floorGuardOff && <FloorGuardBanner />}
        {loadError && <p className="text-sm text-fail">{loadError}</p>}
        {kiosks && <KioskTable kiosks={kiosks} onRename={setRenaming} onRevoke={setRevoking} />}
      </CardContent>
      <RevokeDialog kiosk={revoking} onClose={() => setRevoking(null)} onConfirm={revoke} />
      <RenameDialog kiosk={renaming} onClose={() => setRenaming(null)} onSave={rename} />
    </Card>
  );
}

type RowActions = { onRename: (k: KioskDTO) => void; onRevoke: (k: KioskDTO) => void };

function KioskTable({ kiosks, ...actions }: { kiosks: KioskDTO[] } & RowActions) {
  const { t } = useApp();
  if (kiosks.length === 0) return <p className="text-sm text-muted-foreground">{t.noStations}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.stationCol}</TableHead>
          <TableHead>{t.stationLastSeen}</TableHead>
          <TableHead>{t.stationStateCol}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {kiosks.map((k) => <KioskRow key={k.id} kiosk={k} {...actions} />)}
      </TableBody>
    </Table>
  );
}

function KioskRow({ kiosk: k, onRename, onRevoke }: { kiosk: KioskDTO } & RowActions) {
  const { t, pending, lang } = useApp();
  const seen = k.lastSeenAt ? new Date(k.lastSeenAt).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA") : t.stationNever;
  return (
    <TableRow>
      <TableCell className="font-bold">{k.label}</TableCell>
      <TableCell className="font-mono text-xs">{seen}</TableCell>
      <TableCell>
        <Badge variant={k.revokedAt ? "destructive" : "secondary"}>
          {k.revokedAt ? t.stationRevokedL : t.stationActiveL}
        </Badge>
      </TableCell>
      <TableCell className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => onRename(k)}>{t.stationRenameBtn}</Button>
        {!k.revokedAt && (
          <Button variant="destructive" size="sm" disabled={pending} onClick={() => onRevoke(k)}>{t.stationRevokeBtn}</Button>
        )}
      </TableCell>
    </TableRow>
  );
}

type DialogProps = { kiosk: KioskDTO | null; onClose: () => void };

function RevokeDialog({ kiosk, onClose, onConfirm }: DialogProps & { onConfirm: (id: string) => void }) {
  const { t } = useApp();
  return (
    <Dialog open={kiosk !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.stationRevokeBtn}</DialogTitle>
          <DialogDescription>{t.stationRevokeConfirm.replace("{label}", kiosk?.label ?? "")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t.cancel}</DialogClose>
          <Button variant="destructive" onClick={() => kiosk && onConfirm(kiosk.id)}>{t.stationRevokeYes}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ kiosk, onClose, onSave }: DialogProps & { onSave: (id: string, label: string) => void }) {
  const { t } = useApp();
  const [label, setLabel] = useState("");
  // Le champ repart du nom courant à chaque ouverture.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (kiosk && openedFor !== kiosk.id) {
    setOpenedFor(kiosk.id);
    setLabel(kiosk.label);
  }
  return (
    <Dialog open={kiosk !== null} onOpenChange={(open) => !open && (setOpenedFor(null), onClose())}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t.stationRenameBtn}</DialogTitle></DialogHeader>
        <Label htmlFor="kiosk-rename">{t.stationLabel}</Label>
        <Input id="kiosk-rename" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t.cancel}</DialogClose>
          <Button disabled={!label.trim()} onClick={() => kiosk && (setOpenedFor(null), onSave(kiosk.id, label))}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
