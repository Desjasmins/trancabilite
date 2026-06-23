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
| Persistance  | Server Actions (`src/app/actions.ts`)            |
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

## Modèle de données (`prisma/schema.prisma`)

- **Unit** — cœur de la traçabilité. Le **statut est dérivé** des champs d'étapes
  (voir `src/lib/status.ts`), jamais stocké.
- **Batch** — lot de production (PO + projet).
- **Delivery** — livraison (`LIV-AAAA-NNN`).
- **Operator**, **Settings**, **LabelTemplate** — opérateurs, défauts, gabarit.

## Notes

Trois capacités restent **côté navigateur** (ce sont des API client, pas des
limites du serveur) :

1. Impression **ZPL via WebUSB** vers Zebra (Chrome/Edge, contexte sécurisé).
2. `window.print()` pour les étiquettes et rapports.
3. Éditeur d'étiquette drag-and-drop + génération QR/code-barres.
