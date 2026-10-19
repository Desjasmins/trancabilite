"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./app-context";
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

/**
 * Onglet Atelier « Cet écran » (#4) : état de l'écran courant et, pour un admin connecté,
 * enregistrement. Rien n'est encore exigé : un écran non enregistré travaille comme avant.
 */
export function ThisScreen({ screen }: { screen: ScreenState }) {
  const { t, run, setUi, user, pending } = useApp();
  const router = useRouter();
  const [label, setLabel] = useState("");
  const isAdmin = user?.role === "admin";

  const pair = async () => {
    const res = await run(pairKioskAction({ label }), t.stationPaired);
    // Le cookie vient d'être posé : le rendu serveur relit l'état de l'écran.
    if (res.ok) router.refresh();
  };

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>{t.tabThisScreen}</CardTitle>
        {screen.status === "paired" && (
          <CardDescription>
            {t.stationPairedAs} <strong className="text-foreground">{screen.label}</strong>
          </CardDescription>
        )}
        {screen.status === "revoked" && <CardDescription>{t.errors.KIOSK_REVOKED}</CardDescription>}
        {screen.status === "none" && (
          <>
            <CardDescription className="font-bold text-foreground">{t.stationUnpairedTitle}</CardDescription>
            <CardDescription>{t.stationUnpairedBody}</CardDescription>
          </>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isAdmin ? (
          <>
            <p className="text-sm text-muted-foreground">{t.stationPairWarn}</p>
            <Label htmlFor="kiosk-label">{t.stationLabel}</Label>
            <Input
              id="kiosk-label"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              className="h-12 text-base"
            />
            <Button size="lg" className="h-12" disabled={pending || !label.trim()} onClick={pair}>
              {t.stationPairBtn}
            </Button>
          </>
        ) : (
          !user && (
            <Button
              size="lg"
              variant="outline"
              className="h-12"
              onClick={() => setUi({ mode: "bureau", station: null, screen: false })}
            >
              {t.stationUnpairedLogin}
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

/** Onglet Bureau « Écrans d'atelier » (#4, admin) : liste, renommer, retirer l'accès. */
export function KioskList() {
  const { t, run, pending, lang } = useApp();
  const [kiosks, setKiosks] = useState<KioskDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<KioskDTO | null>(null);
  const [renaming, setRenaming] = useState<KioskDTO | null>(null);
  const [newLabel, setNewLabel] = useState("");

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
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA") : t.stationNever;

  const revoke = async () => {
    if (!revoking) return;
    const id = revoking.id;
    setRevoking(null);
    apply(await run(revokeKioskAction({ id }), t.stationRevoked));
  };
  const rename = async () => {
    if (!renaming) return;
    const id = renaming.id;
    setRenaming(null);
    apply(await run(renameKioskAction({ id, label: newLabel }), t.saved));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.tabStations}</CardTitle>
      </CardHeader>
      <CardContent>
        {loadError && <p className="text-sm text-fail">{loadError}</p>}
        {kiosks && kiosks.length === 0 && <p className="text-sm text-muted-foreground">{t.noStations}</p>}
        {kiosks && kiosks.length > 0 && (
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
              {kiosks.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-bold">{k.label}</TableCell>
                  <TableCell className="font-mono text-xs">{when(k.lastSeenAt)}</TableCell>
                  <TableCell>
                    {k.revokedAt ? (
                      <Badge variant="destructive">{t.stationRevokedL}</Badge>
                    ) : (
                      <Badge variant="secondary">{t.stationActiveL}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        setNewLabel(k.label);
                        setRenaming(k);
                      }}
                    >
                      {t.stationRenameBtn}
                    </Button>
                    {!k.revokedAt && (
                      <Button variant="destructive" size="sm" disabled={pending} onClick={() => setRevoking(k)}>
                        {t.stationRevokeBtn}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.stationRevokeBtn}</DialogTitle>
            <DialogDescription>{t.stationRevokeConfirm.replace("{label}", revoking?.label ?? "")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t.cancel}</DialogClose>
            <Button variant="destructive" onClick={revoke}>
              {t.stationRevokeYes}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.stationRenameBtn}</DialogTitle>
          </DialogHeader>
          <Label htmlFor="kiosk-rename">{t.stationLabel}</Label>
          <Input id="kiosk-rename" value={newLabel} maxLength={60} onChange={(e) => setNewLabel(e.target.value)} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t.cancel}</DialogClose>
            <Button disabled={!newLabel.trim()} onClick={rename}>
              {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
