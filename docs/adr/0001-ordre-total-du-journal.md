# ADR 0001 — Ordre total du journal TraceEvent (#19)

Statut : ACCEPTÉ · 2026-10-20 · source : run `20261020-091453-design-controle-visuel` (TDD/ADR Rév. 3, §B1/B4)

## Contexte
Le renvoi au Montage écrira `fail` puis `rework` dans une même transaction. `now()` PostgreSQL
rend l'heure de début de transaction et l'`id` est un cuid : l'ordre relu était indéterminé.

## Décision
- `compareEvents` (`src/lib/process.ts`) : `createdAt`, puis rang (`fail` 0 < `rework` 1 < `pass`/`done` 2,
  exhaustif sur l'enum `EventResult`), puis `id`. Tout lecteur du journal trie avec lui ; la lecture SQL
  utilise `EVENT_ORDER` (`createdAt`, `id`).
- Événements écrits explicitement dans une transaction : heure lue en base par `dbNow(tx)`
  (`SELECT clock_timestamp()`), jamais l'horloge Node ; `pairTimestamps` : `fail` = t, `rework` = t + 1 ms.
- `deriveCurrentStep(steps, events)` : rejoue le journal trié ; `rework` avec `data.to = X` annule les
  réussites des étapes de position ≥ X ; `rework` sans `data.to` (retest hérité) n'annule rien.

## Écarté
Colonne `seq BIGSERIAL` : migration et remplissage sur une table en production. À réévaluer si plus de
deux événements sont écrits par transaction.

## Conséquences
Aucune migration. Pour des journaux existants à `createdAt` distincts, l'ordre est inchangé.
