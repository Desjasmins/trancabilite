# Lightbase · Traçabilité de fabrication

Application fullstack de traçabilité de production de sous-assemblages, alignée sur
la traçabilité **ISO 9001** (§7.5, §8.5.2, §8.7). Portée depuis un prototype HTML
unique vers une application **Next.js + PostgreSQL** persistante.

## Stack

| Couche       | Choix                                            |
| ------------ | ------------------------------------------------ |
| Framework    | Next.js 16 (App Router, Turbopack, React 19)     |
| UI           | shadcn/ui + Tailwind CSS 4 (thème sombre ambre)  |
| Base         | PostgreSQL via Prisma 7 (driver adapter `pg`)    |
| Validation   | Zod 4 (toutes les entrées des Server Actions)    |
| Persistance  | Server Actions (`src/app/actions/`)              |
| i18n         | FR / EN (dictionnaire `src/lib/i18n.ts`)         |
| Codes        | `qrcode` (QR) + `jsbarcode` (CODE128) + ZPL      |

## Démarrage

```bash
pnpm install

# 1) Connexion base de données
cp .env.example .env        # puis renseignez DATABASE_URL

# 2) Schéma + données de démo
pnpm db:push                # crée les tables
pnpm db:seed                # 7 unités, 2 lots, 1 livraison, 6 opérateurs

# 3) Lancer
pnpm dev                    # http://localhost:3000
```

> Tant que `DATABASE_URL` n'est pas configurée, l'application affiche un écran
> d'aide à la connexion plutôt qu'une erreur.

### Scripts

| Script             | Rôle                                        |
| ------------------ | ------------------------------------------- |
| `pnpm dev`         | Serveur de développement                    |
| `pnpm build`       | Build de production                         |
| `pnpm db:push`     | Applique le schéma Prisma à la base         |
| `pnpm db:migrate`  | Crée/applique une migration versionnée      |
| `pnpm db:seed`     | Charge les données de démonstration         |
| `pnpm db:studio`   | Explorateur de base Prisma Studio           |
| `pnpm test`        | Tests Vitest (`src/**/*.test.{ts,tsx}`, `test/**/*.test.ts`) |
| `pnpm test:changed`| Tests des fichiers modifiés depuis `main`   |
| `pnpm test:cov`    | Tests avec couverture (v8)                  |

Les trois scripts de test lancent `prisma generate` avant (sans connexion). Les tests
ne joignent jamais de base : `@/lib/db`, `@/lib/auth` et `next/headers` se bouchonnent
avec `test/mocks/`, et `test/setup/guard-db.ts` (`setupFiles`) refuse de tourner si `DATABASE_URL`
ou `DIRECT_URL` vise un autre hôte que `127.0.0.1` ou `localhost`.

## Fonctionnalités

### 🏭 Atelier (opérateurs) — flux 5 postes

`Étiquettes → Montage → Test → Vérification → Emballage`, avec blocage des
non-conformités (statut `rejet`).

- **Étiquettes** — création de lot (PO, projet, réf, quantité, S.N. de départ) +
  impression des étiquettes.
- **Montage / Test / Vérification** — scan (lecteur code-barres / clavier) +
  confirmation par opérateur. Le **Test** (banc PAN 003) enregistre diélectrique,
  polarité et effort de raccord avec note de non-conformité.
- **Séparation des tâches** — avertissement si le vérificateur = le monteur.
- **Emballage** — création/reprise de livraison + scan des unités prêtes.

### 🗄️ Bureau (gestion) — 5 onglets

- **Registre** — base complète, recherche, filtre par statut, panneau de détail.
- **Lots** — regroupement par lot, compteurs de statut, réimpression.
- **Rapports** — bons de livraison imprimables avec signatures.
- **Étiquette** — éditeur WYSIWYG drag-and-drop (formats Brother/Dymo/Zebra/Avery,
  QR/code-barres, impression dialogue / Chrome kiosk / **ZPL direct via WebUSB**).
- **Paramètres** — défauts + opérateurs + statistiques.

Transversal : **i18n FR/EN**, mode client (lecture seule).

## Rôles et droits

Les comptes du Bureau sont des comptes Better Auth à trois rôles. Sans inscription publique, c'est l'admin qui crée les comptes. Les droits sont vérifiés **côté serveur** à chaque Server Action, selon le tableau unique `src/app/actions/policies.ts`.

| Rôle | Ce qu'il peut faire |
|---|---|
| **Admin** | Tout ce que fait le superviseur, plus l'enregistrement des écrans d'atelier (onglet « Écrans d'atelier ») et les routes d'administration des comptes de Better Auth (greffon `admin`). |
| **Superviseur** | Écritures du Bureau : modifier un lot, enregistrer les paramètres et les opérateurs, enregistrer le gabarit d'étiquette, remettre en essai une unité non conforme (le journal porte son nom). |
| **Client** | Lecture seule du registre et des rapports. Il ne reçoit ni la liste des opérateurs ni le gabarit enregistré. Toute écriture du Bureau lui est refusée. |

Un rôle hors de ces trois valeurs, ou un compte banni, n'a aucun droit au Bureau.

**Atelier (#5)** : ses écritures (créer un lot, valider un poste, remise en essai, emballer, livraisons, impression) demandent un **écran enregistré** ou un admin/superviseur connecté (`FLOOR_WRITE`) ; la lecture (page, synchro) demande un écran enregistré ou un compte de rôle connu (`READ`). Un client connecté sur un écran enregistré a les droits de l'écran, ni plus ni moins. Un compte banni ou de rôle inconnu n'a aucun droit. Un écran retiré est refusé, sauf admin ou superviseur connecté.

### Drapeau `ACCESS_ENFORCE_FLOOR` (#5, temporaire, échéance 2026-11-30)

Variable **serveur** (jamais `NEXT_PUBLIC_*`), lue à chaque requête ; seule la valeur exacte `true` active la garde.

- **Absente ou autre valeur (éteint)** : seul l'appel sans session ni cookie d'écran passe encore, comme avant le #5. Un client, un banni ou un rôle inconnu sans écran est refusé ; un écran retiré aussi. L'admin voit le bandeau « Garde de l'atelier inactive » (onglet « Écrans d'atelier » et en-tête du Bureau) ; le serveur journalise un avertissement une fois par démarrage.
- **`true` (posé)** : sans écran ni compte, la page affiche « Écran non enregistré » et la connexion, sans aucune donnée ; un écran déjà ouvert arrête sa synchro et se recharge.

**Procédure d'activation** (geste de Gedeon) : 1) déployer le #4 ; 2) enregistrer **chaque** écran de l'usine ; 3) poser `ACCESS_ENFORCE_FLOOR=true` dans Vercel (Production) ; 4) redéployer (Vercel n'applique une variable qu'aux nouveaux déploiements). Le ticket #5 n'est fermé qu'après la pose confirmée en production.

**Retour arrière** : retirer la variable dans Vercel et redéployer. Aucune donnée n'est touchée.

### Écrans d'atelier (#4)

Un admin connecté **sur l'écran lui-même** l'enregistre depuis l'onglet Atelier « Cet écran ». Le navigateur reçoit un cookie (`__Host-lb_kiosk` en production, `lb_kiosk_dev` en dev, 400 jours, httpOnly) ; la base (`kiosks`) n'en garde que l'empreinte SHA-256. Chaque événement validé depuis cet écran porte son id (`trace_events.stationId`) ; la fiche d'une unité affiche le nom de l'écran, ou « Écran non identifié » (historique, écran non enregistré). Un écran n'est jamais supprimé : l'admin lui **retire l'accès** (onglet Bureau « Écrans d'atelier »), et ses appels d'atelier sont alors refusés (sauf si un admin ou un superviseur est connecté). Un écran non enregistré ne travaille plus une fois le drapeau `ACCESS_ENFORCE_FLOOR` posé (voir plus haut). Deux écrans actifs ne peuvent pas porter le même nom. **Renommer un écran change son nom affiché dans tout l'historique** : le journal ne garde que son identifiant, et la fiche d'une unité montre toujours le nom courant. Un client connecté sans écran ne voit pas le nom des écrans.

**Déploiement du #4** : 1) appliquer le schéma (nouvelle table `kiosks`, index sur `trace_events.stationId` — ajout pur) ; 2) déployer le code ; 3) enregistrer chaque écran de l'usine. Puis activer la garde (procédure du drapeau, #5).

## Modèle de données (`prisma/schema.prisma`)

- **Unit** — cœur de la traçabilité. Le **statut est dérivé** des champs d'étapes
  (voir `src/lib/status.ts`), jamais stocké.
- **Batch** — lot de production (PO + projet).
- **Delivery** — livraison (`LIV-AAAA-NNN`).
- **Operator**, **Settings**, **LabelTemplate** — opérateurs, défauts, gabarit.
- **Kiosk** — écran d'atelier enregistré (empreinte du jeton, dernière activité, révocation).

## Notes

Trois capacités restent **côté navigateur** (ce sont des API client, pas des
limites du serveur) :

1. Impression **ZPL via WebUSB** vers Zebra (Chrome/Edge, contexte sécurisé).
2. `window.print()` pour les étiquettes et rapports.
3. Éditeur d'étiquette drag-and-drop + génération QR/code-barres.
