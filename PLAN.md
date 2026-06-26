# Plan d'évolution — Traçabilité Lightbase (approche « fondations d'abord »)

> Statut : **proposition, à valider avant tout code.**
> Contexte : retours du patron (lots sans test, pas d'impression auto à la création,
> export Excel, multi-écrans temps réel, auth, séquence de postes modifiable).

## Principe directeur

Ne pas empiler 6 features sur le modèle actuel. Deux demandes (« lot sans test » et
« changer la séquence des postes ») sont **le même problème** : le routage est une
**donnée**, pas du code. Et comme c'est un système **qualité ISO 9001**, le cœur doit
être un **journal d'événements** (qui/quand/quoi, immuable) dont l'état se **dérive** —
ce qui règle d'un coup l'auditabilité, la concurrence des 5 écrans et l'historique.

On profite du fait que la base va être vidée (**timing idéal, zéro migration douloureuse**).

---

## Décisions confirmées

- **Kiosque** à l'atelier (pas de login par scan), comptes **Better Auth** pour le Bureau.
- **Synchro temps réel maintenant** (Supabase Realtime).
- Routage **piloté par la donnée** (gammes), pas de cas particulier `skipTest`.
- État dérivé d'un **journal d'événements** (traçabilité ISO + concurrence sûre).
- On **authentifie le poste** (kiosque ≠ anonyme) pour garder la non-répudiation.

## Décisions encore ouvertes

1. Export : **`.xlsx`** (recommandé) ou CSV ? Total ou vue filtrée ?
2. Poste **Étiquettes** : garder « créer + imprimer » ou enlever aussi l'impression auto ?
3. Vidage : garder opérateurs/réglages/gabarit (recommandé) ou tout vider ?

---

# Phase 0 — Fondations (le gros morceau, à faire en premier)

Refonte interne du modèle de données et de la logique de statut. **L'UI et le
comportement visibles restent identiques** — c'est un changement de socle, pas de surface.

### 0.1 — Routage par gamme (résout « lot sans test » + future séquence de postes)

```
Operation        // catalogue des types de poste de production
  key            // "montage" | "test" | "verification" | (futurs)
  labelFr, labelEn
  kind           // STANDARD | QC   (QC = enregistre un résultat pass/fail)

Route            // gamme de fabrication = séquence ordonnée d'opérations
  id, name, isDefault

RouteStep
  routeId, operationKey, position

Batch
  + routeId      // un lot suit une gamme ; les unités héritent de la gamme du lot
```

Gammes initiales seedées :
- **Standard** : montage → test → vérification
- **Sans test** : montage → vérification

Étiquette (création) et Emballage (livraison) restent les bornes du cycle de vie ;
la gamme couvre les opérations de production/QC entre les deux.

### 0.2 — Journal d'événements (traçabilité ISO + concurrence)

```
TraceEvent       // append-only, immuable — LE registre de vérité
  id, unitId
  operationKey   // l'opération concernée
  result         // PASS | FAIL | DONE | null
  operator       // nom (atelier kiosque)
  stationId      // identité du poste (cf. Phase 3)
  data           // JSON : { diel, pol, eff } pour le test
  note           // non-conformité
  createdAt
```

L'état d'une unité se **dérive** du repli de ses événements sur sa gamme.

### 0.3 — Cache d'état sur l'unité (perf des files d'attente)

Source de vérité = événements. Pour des requêtes de file rapides, on maintient un
cache **mis à jour dans la même transaction** que l'événement :

```
Unit
  // identité (inchangé) : serie, projet, reference, po, dessin, sub, batchId, deliveryId, dateCreation
  currentOperationKey   // prochaine opération attendue (null = gamme terminée → prêt à emballer)
  statusKey             // dérivé : en cours @ étape / prêt / emballé / non-conforme
  version               // verrou optimiste
  // les colonnes par-étape (montagePar, testDiel, …) disparaissent → remplacées par les events
```

### 0.4 — Transitions sûres (le vrai enjeu : 5 écrans, qualité)

Une action = une fonction serveur `recordOperation(unitId, operationKey, …)` qui, **en
transaction** :
1. verrouille la ligne unité (`FOR UPDATE`),
2. vérifie que `operationKey` == l'étape attendue de la gamme (sinon rejet propre — **idempotent**, un re-scan ne refait rien),
3. vérifie le `version` (verrou optimiste, refuse une action sur donnée périmée),
4. insère le `TraceEvent`,
5. avance `currentOperationKey` à l'étape suivante (ou « prêt » si dernière) ; un résultat **FAIL** sur une opération QC → `statusKey = non-conforme` (bloqué),
6. incrémente `version`.

Garde **séparation des tâches** (vérificateur ≠ monteur) conservée.

### 0.5 — Vidage + re-seed propre

Migration sur Supabase, base repartie propre : opérations + gammes seedées,
opérateurs/réglages/gabarit conservés (à confirmer), **zéro donnée de production**.

> Adapter `statut()`/`queueFor()` pour lire `currentOperationKey` au lieu de la
> séquence codée en dur. La file d'un poste = unités dont `currentOperationKey` == ce
> poste, non bloquées. File Emballage = gamme terminée, non livrée.

---

# Phase 1 — Features qui « tombent » du socle

- **1.1 Lot sans test** : simple sélection de la gamme « Sans test » à la création du lot (Bureau). Plus aucun cas particulier dans le code.
- **1.2 Création de lot sans impression auto** : retirer l'appel d'impression après création (Bureau). Boutons d'impression conservés ailleurs.
- **1.3 Export Excel du registre** : bouton dans Bureau → Registre, respecte recherche/filtre (`.xlsx` via SheetJS, à confirmer).

# Phase 2 — Temps réel (Supabase Realtime)

- Activer Realtime sur `units` / `trace_events` / `deliveries`.
- Le client s'abonne ; sur changement → **signal d'invalidation** qui recharge la file concernée. Le serveur reste la source de vérité (Realtime ne transporte pas la donnée métier).
- Nouvelles env : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (local + Vercel).
- Politique RLS/lecture à définir sur les tables abonnées.

# Phase 3 — Better Auth + RBAC (kiosque)

- Better Auth + adaptateur Prisma → tables `user`/`session`/`account`/`verification`.
- Rôles : **Admin** / **Superviseur** / **Client** (lecture seule).
- **Atelier ouvert (kiosque) mais poste authentifié** (chaque écran a une identité de station → `stationId` dans les events). **Bureau derrière login.**
- Petit écran admin (créer comptes, assigner rôles).
- Env : `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

---

## Ce qu'on NE construit PAS maintenant (anti-sur-ingénierie)

| On blinde maintenant | On reporte |
|---|---|
| Modèle : gammes + journal d'événements | UI de configuration des gammes/postes |
| Intégrité des transitions + concurrence | Multi-usine / multi-tenant |
| Migrations propres (base vide) | RBAC fin au-delà de 3 rôles |
| Identité de poste | Scan matériel réel (prévu « cet été ») |

La séquence de postes devient **modifiable par la donnée** (ajouter une opération + une
gamme), mais **sans UI dédiée** tant que la compagnie a 5 postes fixes.

## Récap infra

- Migrations Prisma sur Supabase : opérations, gammes, événements, refonte unité ; puis tables Better Auth.
- Env Vercel à ajouter : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.
- 1 librairie d'export Excel (SheetJS).
- Tests d'invariants sur la machine à états (un FAIL ne doit jamais devenir « livrable »).

## Ordre d'exécution

Phase 0 (socle + vidage) → Phase 1 (lot sans test, sans impression, export) →
Phase 2 (temps réel) → Phase 3 (auth + RBAC).
