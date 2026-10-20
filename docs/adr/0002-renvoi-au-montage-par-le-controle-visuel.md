# ADR 0002 — Renvoi au Montage par le contrôle visuel (#21)

Statut : accepté (Gedeon, 2026-10-20). Source : `tasks/20261020-091453-design-controle-visuel/` (TDD/ADR Rév. 3).

## Contexte
Le poste Test ajoute, pour tous les types, un essai commun « Contrôle visuel » après les essais PAN 003
(`src/lib/tests.ts`). Un défaut visuel se répare au Montage : bloquer l'unité au Test ferait attendre un
superviseur pour rien.

## Décision
- Visuel refusé → `recordOperation(..., { reworkTo: { step: "montage", cause: "visual" } })` écrit, dans une
  transaction, `fail` (t) puis `rework` `{ to: "montage", cause: "visual" }` (t + 1 ms, t = `dbNow()`), remet
  l'unité à `montage`, **non bloquée**, `nc` = motif, en un seul `updateMany` versionné. Conflit → rollback,
  aucun événement. Cible absente ou ne précédant pas l'étape → `REWORK_TARGET_INVALID`.
- **Double échec visuel + électrique → renvoi, sans blocage** (décision de Gedeon, qui prime sur le critère
  contraire du ticket). L'échec électrique reste dans `data` du `fail` ; l'unité repasse tout le Test.
- Électrique refusé seul → bloquée au Test (inchangé). Tout `done`/`pass` remet `nc` à null.
- Motif obligatoire dès qu'un essai est refusé (`NC_REQUIRED`, vérifié client et serveur).
- Badge « Reprise » : seule source `pendingRework(events)` (`src/lib/process.ts`) → `UnitDTO.reprise`.
  `Unit.nc` n'est qu'un cache. `toUnitDTO` lit le Test sur le dernier `pass`/`fail`, jamais un `rework`.

## Conséquences
- Le registre du Bureau n'affiche pas encore le résultat visuel (`bureau.tsx`, après #20).
- Compteur de reprises (T4) et photo (T5) hors périmètre.
