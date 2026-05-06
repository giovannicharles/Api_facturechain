# FactureChain — Backend

Backend Node.js + Express + MongoDB pour **FactureChain**, plateforme camerounaise de suivi de la consommation électrique des abonnés ENEO.

> **But** : redonner aux abonnés une visibilité temps réel sur leur consommation, détecter automatiquement les anomalies de facturation, et tracer les réclamations bout en bout — pendant que ENEO reste l'opérateur officiel.

---

## Sommaire

1. [Vue d'ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Installation rapide](#installation-rapide)
4. [Comptes de démo](#comptes-de-démo)
5. [Architecture](#architecture)
6. [Endpoints API](#endpoints-api)
7. [Modèle de données](#modèle-de-données)
8. [Détection d'anomalies](#détection-danomalies)
9. [Ledger / hash chain (préparation blockchain)](#ledger--hash-chain-préparation-blockchain)
10. [Adapter ENEO](#adapter-eneo)
11. [Sécurité](#sécurité)
12. [Roadmap](#roadmap)

---

## Vue d'ensemble

Le backend expose une **API REST** consommée par trois fronts :

- **App mobile React Native** (abonné) — scan/recherche de factures, historique, anomalies, réclamations, auto-relevé photo, carte de coupures.
- **Web abonné Angular** — mêmes fonctionnalités + dashboards riches.
- **Web admin Angular** — KPIs, console réclamations type ticketing, modération signalements, gestion comptes, annonces.

Sa philosophie : **être prêt le jour où ENEO ouvrira une API**, et fonctionner en mode démonstration jusque-là grâce à l'**Adapter ENEO** (`mock` ↔ `http`).

Chaque facture est **scellée par un hash SHA-256** chaîné à la facture précédente du même compteur. Cette chaîne d'intégrité interne sert deux buts : (1) prouver à l'abonné qu'une facture n'a pas été altérée a posteriori, (2) préparer le passage à une vraie blockchain (mode `LEDGER_MODE=blockchain`, déjà câblé en stub).

---

## Prérequis

- **Node.js ≥ 18**
- **MongoDB** : soit local (`mongodb://127.0.0.1:27017`), soit MongoDB Atlas
- npm (fourni avec Node)

---

## Installation rapide

```bash
# 1. Installer
npm install

# 2. Configurer
cp .env.example .env
# → puis éditer .env (au minimum MONGODB_URI et les secrets JWT)

# 3. Charger les données de démo
npm run seed:reset

# 4. Démarrer (mode dev avec rechargement à chaud)
npm run dev
```

L'API tourne sur `http://localhost:4000/api/v1`.

Vérification rapide : `curl http://localhost:4000/api/v1/health`

---

## Comptes de démo

Tous les comptes ont des mots de passe explicites pour faciliter la démo (à changer évidemment hors démo).

| Rôle      | Email                            | Mot de passe |
| --------- | -------------------------------- | ------------ |
| Admin     | `admin@facturechain.cm`          | `Admin@2024` |
| Agent     | `agent@facturechain.cm`          | `Agent@2024` |
| Abonné    | `marie.atangana@example.cm`      | `Demo@2024`  |
| Abonné    | `patrick.mbarga@example.cm`      | `Demo@2024`  |
| Abonné    | `sandra.eboa@example.cm`         | `Demo@2024`  |
| Abonné    | `francis.ngono@example.cm`       | `Demo@2024`  |
| Abonné    | `rosine.fokou@example.cm`        | `Demo@2024`  |
| Abonné    | `boris.ekane@example.cm`         | `Demo@2024`  |

**Marie Atangana** (Yaoundé/Bastos) et **Patrick Mbarga** (Douala/Akwa, multi-compteurs) ont des anomalies pré-injectées dans leur historique. Idéal pour la démo.

---

## Architecture

```
src/
├── config/         env, database, logger
├── models/         10 schémas Mongoose
├── services/       logique métier (auth, tariff, ledger, anomaly, eneo-adapter, claim, invoice)
├── controllers/    handlers HTTP (auth, customer, invoice, claim, outage, public, admin)
├── routes/         agrégation Express
├── middlewares/    auth JWT, validation Joi, gestion d'erreurs
├── validators/     schémas Joi
├── utils/          helpers (apiError, response, hash, pagination, asyncHandler)
└── seed/           données + script de seed
```

**Stack** : Express, Mongoose, JWT (access + refresh), bcryptjs, Joi, Helmet, CORS, Morgan, Winston, express-rate-limit, PDFKit (génération PDF).

**Conventions de réponse** :
```json
{ "success": true, "data": { ... }, "meta": { "pagination": {...} } }
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "...", "details": [...] } }
```

---

## Endpoints API

Préfixe par défaut : `/api/v1`.

### Authentification

| Méthode | Route                   | Description                                |
| ------- | ----------------------- | ------------------------------------------ |
| POST    | `/auth/register`        | Inscription (avec ou sans `clientId` ENEO) |
| POST    | `/auth/login`           | Login (retourne `accessToken` + `refreshToken`) |
| POST    | `/auth/refresh`         | Rafraîchit l'access token                  |
| POST    | `/auth/logout`          | Révoque le refresh token courant           |
| GET     | `/auth/me`              | Profil + fiche client liée                 |

### Abonné (authentifié)

| Méthode | Route                                    | Description                              |
| ------- | ---------------------------------------- | ---------------------------------------- |
| GET     | `/me/customer`                           | Ma fiche client                          |
| GET     | `/me/meters`                             | Mes compteurs                            |
| GET     | `/meters/:meterId`                       | Détail d'un compteur                     |
| GET     | `/meters/:meterId/invoices?page=&limit=` | Historique des factures (paginé)         |
| GET     | `/meters/:meterId/index-readings`        | 60 derniers relevés                      |
| POST    | `/index-readings`                        | Soumettre un auto-relevé (photo, valeur) |
| GET     | `/meters/:meterId/anomalies`             | Anomalies détectées                      |
| GET     | `/meters/:meterId/consumption-stats`     | Série mensuelle 12 mois + résumé         |
| GET     | `/meters/:meterId/verify-chain`          | Vérifie la chaîne de hash du compteur    |

### Factures

| Méthode | Route                              | Description                                          |
| ------- | ---------------------------------- | ---------------------------------------------------- |
| GET     | `/invoices/search?invoiceNumber=…` | Recherche par numéro (clé centrale du produit)       |
| GET     | `/invoices/:invoiceId`             | Détail facture (+ anomalies attachées)               |
| GET     | `/invoices/:invoiceId/verify`      | Vérifie l'empreinte SHA-256 d'une facture            |
| GET     | `/invoices/:invoiceId/pdf`         | Téléchargement PDF                                   |

### Réclamations

| Méthode | Route                                | Description                          |
| ------- | ------------------------------------ | ------------------------------------ |
| POST    | `/claims`                            | Soumettre une réclamation            |
| GET     | `/claims/mine`                       | Mes réclamations                     |
| GET     | `/claims/:claimId`                   | Détail (incl. messages + historique) |
| POST    | `/claims/:claimId/messages`          | Ajouter un message au fil            |

### Coupures

| Méthode | Route                            | Description                                         |
| ------- | -------------------------------- | --------------------------------------------------- |
| GET     | `/outages?city=…&activeOnly=true`| Liste publique (carte, dashboards)                  |
| POST    | `/outages`                       | Signaler une coupure (auth)                         |
| POST    | `/outages/:id/confirm`           | Confirmer (auto-promotion en `confirmed` à 3 confirms) |
| POST    | `/outages/:id/resolve`           | Marquer résolu (agent/admin)                        |

### Stats publiques

| Méthode | Route                                  | Description                                |
| ------- | -------------------------------------- | ------------------------------------------ |
| GET     | `/public/stats/anomalies-by-zone`      | Anomalies par ville (30 j)                 |
| GET     | `/public/stats/outages-by-zone`        | Coupures par ville (30 j)                  |

### Admin / Agent

| Méthode | Route                                       | Rôle requis | Description                          |
| ------- | ------------------------------------------- | ----------- | ------------------------------------ |
| GET     | `/admin/dashboard`                          | agent/admin | KPIs temps réel                      |
| GET     | `/admin/users?role=&q=`                     | admin       | Liste utilisateurs                   |
| PATCH   | `/admin/users/:userId/status`               | admin       | Suspendre/réactiver un compte        |
| GET     | `/admin/customers?q=`                       | agent/admin | Recherche clients                    |
| GET     | `/admin/claims?status=&type=`               | agent/admin | Console réclamations (paginé)        |
| PATCH   | `/admin/claims/:claimId/status`             | agent/admin | Changer le statut (FSM contrôlé)     |
| PATCH   | `/admin/claims/:claimId/assign`             | admin       | Assigner à un agent                  |
| GET     | `/admin/announcements`                      | agent/admin | Liste des annonces                   |
| POST    | `/admin/announcements`                      | admin       | Créer une annonce                    |

---

## Modèle de données

Dix collections Mongo :

- **User** — compte de connexion (email, password hashé, rôle).
- **Customer** — fiche client ENEO (clientId, adresse, type).
- **Meter** — compteur (numéro unique, catégorie tarifaire, dernier index).
- **Invoice** — facture scellée (hash, previousHash, breakdown tarifaire, écart facturé/recalculé).
- **IndexReading** — relevés (ENEO / auto-relevé / seed).
- **Anomaly** — anomalies détectées (6 types, 3 sévérités).
- **Claim** — réclamation traçée (8 statuts, FSM contrôlé, fil de messages, lien ENEO).
- **PowerOutage** — signalements communautaires de coupures.
- **Announcement** — annonces ENEO/admin (ciblage par zone).
- **AuditLog** — journal d'audit (prêt à brancher).

---

## Détection d'anomalies

Lancée automatiquement à chaque création/import de facture. Six types :

| Type                     | Critère                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `NEGATIVE_INCREMENT`     | Index courant < index précédent                                      |
| `CONSUMPTION_SPIKE`      | Z-score ≥ 2 sur l'historique 12 mois (high si ≥ 3)                   |
| `YOY_DEVIATION`          | Hausse ≥ +50 % vs même mois N-1                                      |
| `IMPOSSIBLE_CONSUMPTION` | > 3 000 kWh/mois sur un compteur résidentiel                         |
| `AMOUNT_MISMATCH`        | Écart ≥ 5 % entre montant facturé et recalcul (high si ≥ 20 %)        |
| `MISSING_READING`        | Période sans relevé (à brancher via tâche planifiée)                 |

Les seuils sont centralisés dans `src/services/anomaly.service.js`.

Les anomalies des 30 derniers jours sont **agrégées par zone** dans `/public/stats/anomalies-by-zone`. Cette pression collective est exposée à toute la communauté et donne le levier de négociation prévu par le projet.

---

## Ledger / hash chain (préparation blockchain)

Chaque facture stocke `hash` et `previousHash`. Le `hash` est calculé en SHA-256 sur les champs canoniques de la facture (numéro, compteur, période, index avant/après, conso, montant, dates) **+ le `previousHash`** de la dernière facture du même compteur. Toute modification ultérieure casse la chaîne.

Endpoints utiles :
- `GET /invoices/:id/verify` — recalcule le hash et le compare au stocké.
- `GET /meters/:id/verify-chain` — parcourt la chronologie complète et retourne `{ valid, brokenAt? }`.

Le hash est imprimé en pied du PDF de la facture, ce qui crée une preuve papier vérifiable.

**Mode `LEDGER_MODE=blockchain`** — le service `ledger.service.js` contient déjà le crochet pour publier le hash sur une blockchain (smart contract d'ancrage). Ce stub log uniquement aujourd'hui ; il suffira de le brancher à l'option choisie (Polygon, Hyperledger Fabric, contrat personnalisé) sans toucher au reste du code.

---

## Adapter ENEO

Le service `eneo-adapter.service.js` isole la source des données ENEO :

- **Mode `mock`** (défaut) — lit dans nos collections locales (issues du seed). Idéal pour démo et développement.
- **Mode `http`** — appelle une vraie API ENEO via `fetch` avec `X-API-Key`. Active dès que `ENEO_API_BASE_URL` et `ENEO_API_KEY` sont fournis et que `ENEO_ADAPTER_MODE=http`.

L'adapter expose : `findInvoiceByNumber`, `findCustomerByClientId`, `findMetersByCustomer`, `transmitClaim`. **Tout le reste du code parle à l'adapter, jamais à ENEO directement** — donc bascule mock ↔ http sans aucune autre modification.

---

## Sécurité

- **Helmet** + **CORS whitelist** + **rate limiting** (300 req / 15 min par IP par défaut).
- **JWT** : access token (15 min) + refresh token rotatif (7 j). Au plus 5 refresh tokens stockés par compte (les plus anciens sont rotés).
- **bcrypt** sur les mots de passe (10 rounds par défaut).
- **Validation Joi** systématique sur les payloads sensibles, `stripUnknown`.
- **Erreur Mongo** dupliquée → 409 lisible ; ID invalide → 400 lisible ; ValidationError Mongoose → 422 avec détails par champ.
- Les abonnés ne voient que **leurs propres** factures, compteurs, réclamations (vérification systématique côté contrôleurs).

À ajouter pour la prod :
- 2FA (idéalement OTP SMS — pertinent au Cameroun, voire Free Mobile API).
- Audit log automatique sur les actions sensibles (suspension de compte, changement de statut de réclamation).
- HTTPS obligatoire + cookies secure pour le refresh token.
- Renforcement CSP/HSTS via Helmet (déjà chargé, à configurer).

---

## Roadmap

**Phase 1 — Backend** *(ce projet)* — ✅
**Phase 2** — App mobile React Native (abonné).
**Phase 3** — Web abonné Angular (dashboards riches).
**Phase 4** — Web admin Angular (console ticketing, KPIs).
**Phase 5** — Documents de présentation (Word + PDF).
**Phase 6** — Bascule blockchain réelle + intégration API ENEO si elle ouvre.

---

## Crédits

Données de démo : noms, quartiers, villes camerounaises (Bastos, Akwa, Bonamoussadi, Mvog-Mbi, Kamkop, Nkwen…).
Tarifs ENEO : valeurs réalistes BT résidentiel, **à valider contre la grille en vigueur** avant exploitation.
