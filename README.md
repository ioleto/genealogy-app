# Arbre Généalogique

Application web pour construire et explorer un arbre généalogique familial,
à plusieurs, avec un backend FastAPI, une base PostgreSQL et une interface
React. Pensée pour un déploiement en une fois depuis Portainer.

## Ce que ça fait

- **Fiches** : une fiche par personne (identité, dates et lieux de
  naissance/décès, profession, notes, photo).
- **Liens** : chaque fiche se relie aux autres par des **unions** (mariage,
  union civile, concubinage…) et des **filiations** — le même modèle que
  les logiciels de généalogie professionnels (proche du standard GEDCOM),
  plutôt qu'un simple lien "parent/enfant". Ça gère nativement les
  remariages, demi-frères et sœurs, parents inconnus, etc.
- **Arbre vertical interactif** : navigation en se déplaçant/zoomant dans
  l'arbre, recentrage sur n'importe quelle fiche en cliquant dessus. Deux
  couleurs configurables distinguent la **lignée directe** des
  **conjoint·e·s par alliance**.
- **Export** de l'arbre affiché en **PNG** et **PDF** (image complète,
  indépendante du cadrage à l'écran).
- **Import / export GEDCOM** — le format standard reconnu par la quasi-totalité
  des logiciels de généalogie (Gramps, Geneanet, MyHeritage, Ancestry,
  FamilySearch…), pour sauvegarder l'arbre ou en récupérer un déjà existant.
- **Plusieurs comptes** avec 3 rôles : administrateur (gère aussi les
  comptes), contributeur (édite l'arbre), lecteur (consultation seule).
- **Plusieurs familles** : les fiches peuvent être rattachées à une famille
  nommée (« Famille Dupont », « Famille Martin »…), avec filtre dédié dans
  la liste des fiches. Une fiche sans famille déclarée reste utilisable
  normalement — c'est facultatif, pas une contrainte de rangement.
- **Sélection multiple** dans la liste des fiches : suppression groupée ou
  réassignation groupée à une famille.
- **Paramètres d'apparence** : couleur principale et secondaire, avec
  quelques palettes suggérées.

## Architecture

```
┌───────────┐      /api/*, /uploads/*     ┌───────────┐        ┌────────────┐
│  frontend │ ───────────────────────────▶│  backend  │ ──────▶│ PostgreSQL │
│  (nginx)  │◀─────────────────────────── │ (FastAPI) │        │            │
└───────────┘                              └───────────┘        └────────────┘
```

Le frontend (React, servi par nginx) proxifie les appels `/api/` et
`/uploads/` vers le backend — un seul point d'entrée est donc exposé.
Le backend crée son schéma de base de données et le compte administrateur
tout seul au premier démarrage : aucune migration manuelle à lancer.

## Déployer via Portainer (recommandé)

1. **Pré-requis** : un réseau Docker existant sur ton serveur, sur lequel
   l'application sera exposée (celui de ton reverse proxy — Traefik, Nginx
   Proxy Manager, Caddy…). Si tu n'en as pas :
   ```
   docker network create proxy
   ```
2. Dans Portainer : **Stacks → Add stack → Repository**.
3. Renseigne l'URL de ce dépôt Git et le chemin `docker-compose.yml` (à la
   racine).
4. Portainer détecte les variables sans valeur par défaut et affiche un
   formulaire **Environment variables** — remplis-le :

   | Variable | Description |
   |---|---|
   | `POSTGRES_PASSWORD` | Mot de passe de la base PostgreSQL |
   | `JWT_SECRET` | Chaîne aléatoire (ex. générée avec `openssl rand -hex 32`) |
   | `ADMIN_EMAIL` | Email du compte administrateur créé au démarrage |
   | `ADMIN_PASSWORD` | Mot de passe de ce compte |
   | `NETWORK_NAME` | Nom du réseau Docker existant (étape 1) sur lequel exposer l'app |
   | `PUBLISHED_PORT` | *(optionnel, défaut 8091)* port publié pour un accès direct |

5. **Deploy the stack**. Portainer crée les volumes (`postgres_data`,
   `backend_uploads`) et rattache le frontend au réseau indiqué.
6. Configure ton reverse proxy pour pointer vers le service `frontend`
   (port 80) sur ce réseau — ou accède directement via
   `http://ton-serveur:PUBLISHED_PORT` si tu n'utilises pas de reverse proxy.
7. Connecte-toi avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`, puis crée les autres
   comptes depuis **Utilisateurs**.

Pour mettre à jour l'application plus tard : **Stacks → (ta stack) →
Pull and redeploy** dans Portainer.

## Développement local

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=sqlite+aiosqlite:///./dev.db JWT_SECRET=dev ADMIN_PASSWORD=dev
uvicorn app.main:app --reload

# Frontend (autre terminal)
cd frontend
npm install
npm run dev
```

Ou avec Docker Compose (copie `.env.example` en `.env` d'abord — voir les
avertissements dans ce fichier) :

```bash
cp .env.example .env
docker compose up --build
```

## Notes de conception

- **Modèle de données** : `Person` ↔ `Union` (le couple) ↔ `Filiation`
  (l'enfant rattaché à cette union). Cette indirection par l'union est ce
  qui permet de représenter proprement plusieurs unions successives, des
  enfants de lits différents, ou un parent inconnu.
- **Le backend ne stocke que le graphe complet** (`/api/tree/graph`) ; la
  mise en page de l'arbre (générations, positionnement, couleurs) est
  calculée côté frontend. Ça garde le backend simple et réutilisable pour
  d'autres vues futures (export GEDCOM, statistiques, etc.).
- **Sécurité** : mots de passe hachés avec bcrypt, jetons JWT, accès en
  lecture seule pour le rôle "lecteur", écriture réservée aux
  contributeurs/administrateurs.
- **GEDCOM** : export au format 5.5.1 (le plus largement compatible),
  import tolérant qui lit aussi la plupart des fichiers 7.0 de base (les
  balises INDI/FAM/NAME/BIRT/DEAT/MARR/HUSB/WIFE/CHIL sont stables entre les
  deux versions). Limites assumées : l'import crée toujours de nouvelles
  fiches sans tenter de fusionner avec l'existant (pas de dédoublonnage) ;
  les dates non standard (calendriers non grégoriens) et les pièces jointes
  (photos) ne sont pas prises en charge dans l'échange GEDCOM.
- **Suppression de fiche** : une fiche est toujours détachable, même
  mariée et avec des enfants. La suppression retire proprement ses liens
  (elle est retirée de ses unions, qui survivent avec le conjoint restant ;
  une union sans aucun partenaire connu est supprimée) plutôt que d'être
  bloquée par une contrainte de base de données.
- **Évolution du schéma sans migration manuelle** : au démarrage,
  l'application crée les nouvelles tables *et* ajoute automatiquement les
  colonnes qui manqueraient sur une base déjà existante (ex. l'ajout du
  champ « famille » sur une base créée avant cette fonctionnalité). Un
  simple **Pull and redeploy** dans Portainer suffit donc à absorber les
  mises à jour du modèle de données, sans commande SQL à taper à la main.
