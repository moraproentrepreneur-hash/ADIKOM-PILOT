# Préparation Cloud / Local — LOT 27 et LOT 28

**Caisses et sessions de caisse · Point de vente**

| | |
| --- | --- |
| Date | 8 octobre 2026 |
| Nature | **Préparation.** Aucun code, aucune migration, aucune modification Supabase. Seule modification externe : **O-1 sur Vercel**, autorisée et appliquée le 8 octobre 2026 |
| Méthode | **Cloud → GitHub → Local → Supabase → GitHub → Vercel** — validée le 8 octobre 2026 (§6.0) |
| Point de départ | `4efff48` · 107 migrations · 229 capacités · 62 tables sauvegardées · 401 tests |
| Normatif | `CLAUDE.md` (§10, §19 bis, §47 bis), Plan 02 (§3.4, §3.5, §7.5, §8–§18), Plan 01 §16–§17, DEC-024, DEC-051 |

---

# 1. État de référence — vérifié le 8 octobre 2026

| Élément | Attendu | Constaté | Comment |
| --- | :-: | :-: | --- |
| `main` local | `4efff48` | ✅ `4efff48` | `git rev-parse HEAD` |
| `origin/main` | `4efff48` | ✅ `4efff48` | `git fetch` puis `git rev-parse origin/main` |
| Modifications non commitées | — | ✅ aucune | `git status --short` vide |
| Migrations | 107 | ✅ 107 | dernière : `20260929000300_une_facture_fournisseur_nait_par_sa_fonction.sql` |
| Catalogue | 229 | ✅ 229 | assertion de la migration 107 · 229 codes dans `permissions.ts` |
| `backup_scope` | 62 | ✅ 62 | assertion de la migration 104 |
| Tests unitaires | 401 | ✅ **401 / 401**, 19 fichiers | `npx vitest run`, exécuté ce jour |
| Production Vercel | `4efff48` | ✅ READY | API REST, lecture seule |
| LOT 27 / LOT 28 | non commencés | ✅ | aucune table `pos_*`, aucun code `pos.*`, `payment_method` sans MVOLA/HOLO/WAKATI |

Le prochain rapport portera le numéro **21** (LOT 27), puis **22** (LOT 28). La prochaine
décision consignée portera le numéro **DEC-054**.

---

# 2. Ce qui fait autorité pour les deux lots

Il n'existe **aucun document de module « Point de vente »** dans `00 Documentation/03_Modules/`.
La spécification est entièrement portée par :

| Source | Sections utiles |
| --- | --- |
| **Plan 02** | §2.1 (A-9 à A-12, monnaie, sessions) · §3.4 (P-4) · §3.5 (A-11) · §7.5 (circuit PDV, règle de la monnaie, UX) · §8 (doctrines) · §9.1–9.5 (tables, colonnes, index, énumérations) · §10.2 (capacités) · §11.4 (montants par ligne) · §12 (audit) · §13.2 (sauvegarde) · §14.2 (dépendances 7 et 8) · §16 (risques) · §18.2 (critères LOT 27 et 28) |
| **Plan 01** | §16.1–16.15 (schéma détaillé, actes, écrans, UX) · §17.2 (capacités) · §21 (programme de tests demandé par la Direction) · §27.2 (questions B-8 à B-13) |
| **Journal** | DEC-024 (capacités indépendantes) · DEC-051 (remises en montant fixe KMF) · DEC-049 §e (`commercial_line_costs` renvoyée au LOT 28) |
| **Rapport 20** | le motif « née par sa fonction » (drapeau transactionnel + déclencheur `zzz_` en dernier) |

> ⚠️ Le Plan 01 numérotait ces lots **26** et **27**. Le Plan 02 les a renumérotés **27** et **28**.
> Les capacités et totaux du Plan 01 sont périmés ; seuls ceux du Plan 02 valent, recalés sur
> l'existant réel (229, et non 228).

Le LOT 27 doit **écrire `00 Documentation/03_Modules/12_Point_de_Vente.md` avant le premier
`create table`** (Plan 02 §16.3, `CLAUDE.md` §2), et mettre à jour `CLAUDE.md` §10 (module 12,
code `pos`).

---

# 3. LOT 27 — Caisses et sessions de caisse

## 3.1 Fonctionnalités attendues

- Déclarer une **caisse**, adossée **obligatoirement** à un compte financier `CASH` **actif**
  (une caisse n'est pas un compte : elle en utilise un — garantie « une seule trésorerie »).
- **Ouvrir** une session (caisse, caissier = acteur, fond de caisse déclaré).
- **Clôturer** une session avec un **montant compté obligatoire** ; l'écart s'affiche **sans
  bloquer**. Une session close ne se rouvre pas.
- **Une seule session ouverte par caisse.**
- Répondre à « **qui était en caisse le J entre 10h00 et 11h30 ?** ».
- `pos.sessions.view` **n'ouvre pas** les montants ; un caissier voit **les siens**, pas ceux d'un autre.
- Aucune vente au LOT 27. Le montant théorique vaut donc, à ce lot, le fond de caisse ; le
  LOT 28 y ajoutera les encaissements en espèces.

## 3.2 Données

| Objet | Contenu | Notes |
| --- | --- | --- |
| enum `pos_session_status` | `OPEN` · `CLOSED` | enum **nouvelle** : pas de migration isolée nécessaire |
| `pos_registers` | n° `CAI-…`, libellé, `account_id` → `financial_accounts`, lieu, actif, traçabilité | déclencheur : compte `CASH` et `ACTIVE` ; garde « lue sans RLS » (§8.3 n° 5) |
| `pos_sessions` | n° `SES-…`, caisse, `cashier_id`, `opened_at`, `closed_at`, statut, note | `unique (register_id) where status = 'OPEN'` · index GiST sur `tstzrange(opened_at, coalesce(closed_at, 'infinity'))` |
| **montants de session** | fond de caisse, montant compté | **voir §3.4 — table séparée recommandée** |
| fonctions dérivées | `pos_session_expected`, `pos_session_variance` | **D1 : rien de stocké** — un écart stocké mentirait après une annulation |
| numérotation | `pos_register` → CAI, `pos_session` → SES | `numbering_rules` + `next_number` |
| `backup_scope()` | +3 (`pos_registers`, `pos_sessions`, table de montants — T-1 validée) | **62 → 65**, parents avant enfants |

## 3.3 Fonctions, permissions, RLS, audit

**Fonctions** — `security invoker`, `require_capability` en tête, `revoke/grant` explicites, cohérence
avant l'acteur, **aucune `SECURITY DEFINER`** (D4) :
`create_pos_register`, `update_pos_register`, `archive_pos_register` (ou équivalents),
`open_pos_session(register, opening_float)`, `close_pos_session(session, counted_amount, note)`.

**Capacités (Plan 02 §10.2) — +9 → 238**

| Code | Action | Sensible |
| --- | --- | :-: |
| `pos.registers.view` / `.create` / `.update` / `.archive` | VIEW · CREATE · UPDATE · ARCHIVE | |
| `pos.sessions.view` | VIEW | |
| `pos.sessions.amounts.view` | VIEW | ✓ |
| `pos.sessions.open` | CREATE | |
| `pos.sessions.close` | VALIDATE | |
| `pos.sessions.export` | EXPORT | ✓ |

Aucune capacité `download` / `print` au LOT 27 : aucun document de session n'est prévu.
**Aucune** `pos.sessions.variance.view` (Plan 02 §10.3).

**RLS** — patron §8.2 par table (`revoke all from anon`, `revoke delete`, `revoke truncate`,
`has_permission` **en sous-select**). **Nouveau dans le SaaS** : une lecture qui dépend de
**qui est sur la ligne** (`amounts.view` **ou** `cashier_id = current_actor()`).

**Intégrité de création — à poser dès la naissance (leçon du Rapport 20)** : `pos_sessions`
(et `pos_registers` si numérotée) naissent **par leur fonction**, garde par drapeau
transactionnel + déclencheur `zzz_…` en dernier. Sinon un `INSERT` direct contourne le
numéroteur, la caisse active et le compte `CASH`.

**Audit** — `fn_audit_row('pos')` : ouverture (`CREATE`), clôture (`VALIDATE`), avec montants.

## 3.4 🟥 Contradiction technique relevée dans le Plan 02

Le Plan 02 §9.1 place les montants **sur `pos_sessions`** ; ses §6.3 et §11.4 exigent pourtant
que `pos.sessions.view` montre la session **sans** ses montants. **RLS est row-level : elle ne
masque pas une colonne** (DEC-044, précédent `maintenance_costs`, D7). Une policy « par ligne »
sur `pos_sessions` ne peut donc pas laisser voir la ligne **et** cacher ses montants.

🟦 **Recommandation** : une table sœur 1:1 (ex. `pos_session_amounts` : fond, compté) dont le
`select` est gardé par `amounts.view` **ou** `cashier_id = current_actor()`, sous-select compris.
Conséquence : `backup_scope` +3 au lieu de +2. C'est une décision **technique**, conforme à une
doctrine existante ; 🟩 **validée le 8 octobre 2026 (T-1)**, à consigner dans DEC-054.

## 3.5 Interfaces

Module `pos` dans `navigation.ts` / `sidebar.tsx` : `/pdv/caisses` (liste, fiche, création),
`/pdv/sessions` (liste filtrable par période, caisse, caissier ; fiche avec montants gardés).
Bandeau « session ouverte » réutilisable par le LOT 28. Export des sessions (`exports/registry.ts`).
Les sept états UI (`CLAUDE.md` §38), responsive 390 / 768 / 1440. **Aucune entrée « à venir »
pour les ventes** (DEC-042 §d).

## 3.6 Dépendances réelles

Lecture seule de `financial_accounts` (Banques & Caisses) ; numérotation partagée ; catalogue de
capacités ; `backup_scope` ; navigation ; audit. **Aucune** fonction de trésorerie, de facturation
ou de paiement modifiée.

---

# 4. LOT 28 — Point de vente : ventes et encaissement

## 4.1 Fonctionnalités attendues

- Vente de **services** (catalogue LOT 20 : `SALE` ou `BOTH`, actifs, variante active, prix
  résolu à la date de la vente — D16), **sous une session ouverte**, client **facultatif** (A-12).
- Plusieurs paiements par vente ; modes A-9 : **Espèces, Chèque, Mvola, Holo, Wakati**.
- **Règle de la monnaie** (validée) : net 60 000, donné 100 000 → **encaissé 60 000**,
  **monnaie 40 000**, **trésorerie 60 000, jamais 100 000**. Monnaie rendue en espèces seulement.
- **Remise** sous `pos.sales.discount` : la vente reste soldée (A-10).
- **Vente non soldée** sous `pos.sales.credit` : **exige un client** (si P-4 le confirme) et
  produit une **facture client par la chaîne existante**, dont le solde est suivi.
- **Reçu immédiat** (A4, jamais 80 mm, **aucun coût ni marge**), **facture sur demande** (A-11)
  **adossée à l'encaissement**, sans seconde écriture de trésorerie.
- Annulation : vente `CANCELLED`, écriture annulée, solde recalculé, rien d'effacé.
- UX clavier : `Ctrl+K`, `↑↓`, `Entrée`, `F2`, `Échap`, raccourcis annoncés ; total toujours
  visible ; sous 900 px le panier passe dessous et le total devient une barre collante.

## 4.2 Données

| Objet | Notes |
| --- | --- |
| `payment_method` += `MVOLA`, `HOLO`, `WAKATI` | **migration isolée**, sans autre contenu ; **transversal** : ces modes apparaissent aussi dans les règlements clients et fournisseurs |
| `treasury_entry_kind` += `POS_SALE` | **migration isolée** |
| enum `pos_sale_status` | `VALIDATED` · `CANCELLED` |
| `pos_sales`, `pos_sale_lines`, `pos_payments` | `check (applied <= tendered)` · `check (method = 'CASH' or applied = tendered)` · aucun total stocké |
| `treasury_entries.pos_sale_id` | **5ᵉ origine** : `treasury_entries_single_origin` étendue à 5, `fn_treasury_entry_source` / `_immutable` / `_consistent` et policy d'insert **révisées ensemble** |
| `customer_invoices.pos_sale_id` et/ou `customer_payments.pos_sale_id` | **voir §4.4, contradiction C-2** |
| `commercial_line_costs` | renvoyée au LOT 28 par DEC-049 §e ; gardée par `catalog.services.cost.view` |
| numérotation | `pos_sale` → VTE |
| `backup_scope()` | +4 (`pos_sales`, `pos_sale_lines`, `pos_payments`, `commercial_line_costs`) |

## 4.3 Capacités (Plan 02 §10.2) — +8 → 246

`pos.sales.view` · `.create` · **`.discount`** ✓ · **`.credit`** ✓ · `.cancel` ✓ · `.download` ✓ ·
`.print` ✓ · `.export` ✓.

## 4.4 🟥 Contradiction C-2 dans le Plan 02 — à résoudre avant d'écrire le schéma

- §3.5 : « une colonne `pos_sale_id` sur `customer_payments`, **ou** un `customer_invoice_id` sur
  `pos_sales` — **l'un des deux, jamais les deux** ».
- §9.2 : prévoit **à la fois** `customer_invoices.pos_sale_id`, `customer_payments.pos_sale_id`
  **et** `treasury_entries.pos_sale_id`.
- Or `record_customer_payment` produit **toujours** une écriture `CUSTOMER_PAYMENT`. Une facture
  « soldée par le paiement PDV déjà enregistré, sans nouvelle écriture » suppose donc un
  règlement **sans** écriture propre, ce que la chaîne actuelle ne sait pas faire.
- Pour une **vente non soldée**, rien ne dit si l'acompte reçu au comptoir est une écriture
  `POS_SALE` ou un règlement client de la facture produite.

Le Cloud doit **analyser, proposer une seule origine par encaissement, et s'arrêter** pour
validation avant de créer les tables. Le test de référence reste celui du Plan 02 §16.2 :
vente 60 000 puis facture sur demande → **le solde du compte reste 60 000**.

## 4.5 Dépendances réelles — non-régression étendue OBLIGATOIRE

Le LOT 28 touche des briques transversales (§47 bis) : **trésorerie**, **paiements**, **facturation
commune**, **numérotation**, **capacités**, **sauvegarde**. Recettes à rejouer localement :
`treasury.sql`, `transfers.sql`, `customer_payments.sql`, `customer_invoices.sql`,
`supplier_invoices.sql` (enum de paiement), `backup.sql`, `catalog.sql`, `commerce.sql` — puis
`verify:treasury`, `verify:customer-payments`, `verify:capabilities`, `verify:backup`.

---

# 5. Séquence de développement

```
PRÉALABLES     ✅ O-1 appliquée le 08/10/2026  ·  ✅ décisions LOT 27 validées le 08/10/2026
   │
LOT 27 CLOUD   doc module 12 → migrations (types+tables+RLS, fonctions, capacités+numérotation,
   │           backup_scope) → TS (permissions, navigation, écrans, export) → tests Vitest
   │           → recettes SQL et Playwright ÉCRITES (non exécutées) → lint/typecheck/build
   │           → push branche → rapport provisoire
LOT 27 LOCAL   relecture → sauvegarde → db:status → db:push → recettes → corrections
   │           → fusion main → Vercel → recette production ciblée → Rapport 21 · DEC-054
   │
   ▼   ⛔ le LOT 28 ne part QUE de main APRÈS fusion du LOT 27
PRÉALABLES     P-4 rendu · décisions LOT 28 rendues · (option) correctif « née par sa fonction »
   │           sur customer_invoices / customer_payments
LOT 28 CLOUD   analyse C-2 → ARRÊT pour validation → migrations isolées d'enum → tables
   │           → 5ᵉ origine de trésorerie → fonctions → capacités → backup_scope → écran caisse,
   │           historique, reçu → tests → push → rapport provisoire
LOT 28 LOCAL   idem LOT 27 + non-régression trésorerie/paiements/facturation
               + cycle de sauvegarde destructif → Rapport 22 · DEC-055
```

---

# 6. Collaboration Cloud / Local

**Méthode validée par la Direction le 8 octobre 2026 :**
**Cloud → GitHub → Local → Supabase → GitHub → Vercel.** Elle s'applique aux LOT 27 et 28.

## 6.0 Répartition définitive des responsabilités

| Claude Code **Cloud** — développement uniquement | Claude Code **local** (Antigravity) — validation et livraison |
| --- | --- |
| Une branche GitHub **dédiée par lot** | Récupère la branche développée dans le Cloud |
| Lit les documents et décisions du projet | Vérifie les changements et leur conformité aux décisions |
| Développe fonctionnalités, interfaces, fonctions, migrations SQL | Prend la **sauvegarde préalable** |
| Écrit les recettes SQL et les tests | **Applique les migrations** Supabase, de façon contrôlée |
| N'exécute que les vérifications possibles **sans Supabase** | Exécute les tests SQL, RLS, métier et les recettes nécessaires |
| Commits réguliers, **push de sa branche** | Corrige les anomalies |
| Rapport technique **provisoire** | **Fusionne sur `main`** après validation, pousse, vérifie Vercel |
| **S'arrête** et attend la reprise locale | Recette de production, rapport **définitif** |

**Le Cloud ne fait jamais** : fusion sur `main`, application d'une migration, manipulation de
données de production, déclenchement volontaire d'un déploiement Vercel.

**Le LOT 28 ne commence qu'après validation complète et déploiement du LOT 27.**

Workflow de test : `CLAUDE.md` §47 bis — ciblé par défaut, non-régression étendue seulement
quand une brique transversale est réellement touchée.

## 6.1 Ce que le Cloud ne peut pas faire — et ne doit pas tenter

| Impossible dans le Cloud | Pourquoi | Conséquence |
| --- | --- | --- |
| Appliquer une migration | aucun `SUPABASE_DB_URL` — et il ne doit pas en recevoir | les migrations arrivent **non exécutées** : une erreur SQL ne se découvre qu'en local |
| Recettes SQL (`db:verify:*`) | `scripts/run-sql.mjs` exige la base | le Cloud **écrit** `supabase/tests/pos_*.sql`, le local les **exécute** |
| RLS réelle, profils minimaux | idem | aucun résultat de sécurité n'est « acquis » dans le Cloud |
| Recettes Playwright (`verify:*`), `demo:seed` | comptes et base de production | le Cloud peut **écrire** `scripts/verify-pos-*.mjs`, jamais les lancer |
| Cycle de sauvegarde | destructif, base réelle | local uniquement |
| Contrôle Vercel | jeton absent | local uniquement |

**Réalisable** : lecture du dépôt, migrations et recettes écrites, `npm ci`, `lint`, `typecheck`,
`test` (dont la parité TS ↔ SQL du catalogue), `build` — avec des valeurs **factices non
secrètes** si `next build` réclame les deux variables publiques (`https://example.supabase.co`,
`placeholder`), jamais de vraies clés.

## 6.2 ✅ O-1 — un push de branche ne déploie plus sur la production

> **Appliquée et vérifiée le 8 octobre 2026** (mesures 1 et 2 ci-dessous, rien d'autre ;
> Vercel Authentication **non** demandée). Détail : `05_O-1_Securisation_Vercel.md` §6.

Situation constatée **avant** la mesure, en lecture seule sur l'API Vercel :

- `createDeployments: enabled`, **aucune** commande d'ignorance de build ;
- les variables **Preview** contiennent `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  **et `SUPABASE_SERVICE_ROLE_KEY`** — celles de la production.

Sans mesure, tout push de la branche Cloud aurait produit un déploiement Preview, accessible
par URL, exécutant du code non validé contre la base de production, clé de service comprise.

**Mesures appliquées — les deux, cumulées :**

1. **Ignored Build Step** du projet : `if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi`
   — documenté par Vercel : `1` = le build continue, `0` = build abandonné, état `CANCELED`.
   Seule la branche de production (`main`) construit.
2. **`SUPABASE_SERVICE_ROLE_KEY` retirée de la cible Preview**, valeur et cible Production intactes.

🟥 **Limite à connaître** : un `vercel.json` (ou `vercel.ts`) contenant `ignoreCommand` **surcharge**
le réglage du projet, pour la branche qui le porte. La mesure 1 peut donc être neutralisée par le
contenu d'une branche ; c'est pourquoi la mesure 2 s'y ajoute, et pourquoi **le Cloud ne crée ni
ne modifie jamais `vercel.json` / `vercel.ts`** — règle vérifiée à la relecture locale.

État constaté et procédure de vérification : voir `05_O-1_Securisation_Vercel.md`.

Le dépôt GitHub est **public** : rien de ce que le Cloud pousse ne doit contenir de secret, de
donnée réelle ni d'extrait de sauvegarde.

## 6.3 Règles de branche

| Règle | Détail |
| --- | --- |
| Une branche par lot | `lot-27-caisses-sessions`, puis `lot-28-point-de-vente`, créées depuis `main`. Si la plateforme impose un préfixe (`claude/…`), le rapport provisoire nomme la branche réelle |
| Le Cloud ne touche jamais `main` | ni push, ni fusion, ni PR fusionnée ; PR **brouillon** seulement si demandée |
| Gel de `main` | tant qu'une branche Cloud est ouverte, `main` ne reçoit **aucune migration**. Correctif urgent → la branche Cloud est rebasée par le local avant validation |
| Horodatage des migrations | strictement **après** `20260929000300`, dans l'ordre d'application voulu ; les extensions d'enum seules dans leur migration |
| Migration appliquée = migration figée | une correction après `db:push` est une **nouvelle** migration, jamais une réécriture |
| Le LOT 28 part du `main` fusionné | jamais de la branche LOT 27, jamais avant la fusion |

## 6.4 Procédure de reprise locale (résumé — détail dans les prompts 02 et 04)

1. `git fetch` ; contrôler `git status` (rien à écraser) ; suivre la branche Cloud.
2. Vérifier la base : `git merge-base --is-ancestor <sha main> HEAD` ; lister `git log main..HEAD`
   et `git diff --stat main...HEAD`.
3. **Contrôle des secrets** sur le diff ; aucun `.env*`, aucune URL de connexion, aucune clé.
4. Relecture : migrations (D4, `revoke/grant`, sous-select, née par sa fonction, `backup_scope`
   ordonné, assertions de total), parité TS ↔ SQL, navigation, registres.
5. `npm ci` · `lint` · `typecheck` · `test` · `build`.
6. `npm run backup:snapshot -- avant-lot-2x` — consigner fichier, tables, lignes.
7. `npm run db:status` : **exactement** les migrations du lot ; puis `npm run db:push`.
8. Recettes SQL du lot puis des dépendances réellement touchées ; recettes de production ciblées.
9. Corrections **sur la branche du lot**.
10. Fusion dans `main` (`--ff-only` si possible), **push sur autorisation**, Vercel READY sur le
    bon sha, recette production ciblée, rapport définitif, DEC, mémoire.

Les migrations additives appliquées avant la fusion sont sans effet sur le code en production :
l'ordre **base puis code** est celui du projet.

---

# 7. Audit rapide — insertion directe sur quatre tables

**Méthode** : lecture statique des **dernières** versions des policies, déclencheurs, contraintes
et fonctions métier. **Rien n'a été exécuté contre Supabase.** « Confirmé » signifie : aucune garde
en base ne s'y oppose dans le code lu ; l'épreuve reste à faire localement, dans une transaction
annulée, selon le motif du Rapport 20 §6.3.

Les quatre policies d'INSERT ont la forme `with check (has_permission('<…>.create'))` : elles
répondent à « **qui** », jamais à « **par où** ». Aucune des quatre tables ne porte de garde
« née par sa fonction ».

| Table | Gardes existantes à l'insertion | Ce qu'un `INSERT` direct contourne | Verdict |
| --- | --- | --- | :-: |
| **`supplier_payments`** | statut forcé `VALIDATED` · `amount > 0` · FK · référence non vide | facture **validée** exigée · **reste dû** (trop-payé) · compte **actif** · `next_number` · capacités de lecture (facture, imputations, comptes) · et surtout **l'écriture de trésorerie** : le règlement existe **sans** écriture, la facture paraît réglée, le solde du compte ne bouge pas | 🟥 **Confirmé (statique) — le plus grave** : `CLAUDE.md` §57 |
| **`customer_invoices`** | statut forcé `DRAFT` · cohérence location / période / commande (lue à travers RLS, donc lecture de fait exigée) · échéance ≥ date · index d'unicité | **numéroteur** (`invoice_no` choisi) · `parties.clients.view` · `billing.customer_invoices.view`. Un numéro **futur** choisi à la main fera échouer la création légitime le jour où la séquence l'atteindra | 🟥 **Confirmé (statique)** — même défaut que celui corrigé au Rapport 20 |
| **`sales_orders`** | statut forcé `DRAFT` · date attendue ≥ date · une commande par devis | numéroteur · `parties.clients.view` · `commerce.sales_quotes.view` · devis **accepté** et **du même client** : une commande directe peut s'accrocher au devis d'un autre client, non accepté, et **occuper l'index** qui bloquera sa conversion légitime | 🟥 **Confirmé (statique)** |
| **`purchase_orders`** | symétrique de `sales_orders` | numéroteur · `parties.suppliers.view` · `commerce.purchase_quotes.view` · devis accepté du même fournisseur | 🟥 **Confirmé (statique)** |

**Protections réellement en place** : RLS sans la capacité `create` (refus) · naissance dans le
mauvais état (refus) · `delete` révoqué et interdit par déclencheur · `truncate` révoqué sur les
tables commerciales · transitions gardées par capacité · cohérence location/commande pour
`customer_invoices`.

**Hors des quatre, observé et non audité** : **`customer_payments`** porte exactement la même forme
(policy « qui » + `starts_validated`). C'est la table que le LOT 28 réemploie pour la facture sur
demande et la vente non soldée.

**Non vérifiable dans cette phase** : comportement réel sous PostgREST (privilèges effectifs
d'`authenticated`, `Prefer: return=minimal`), présence éventuelle d'écarts entre le dépôt et la
base de production.

**Aucune correction n'a été faite.** Recommandation : traiter `customer_invoices` et
`customer_payments` **avant le LOT 28** (correctif ciblé, motif du Rapport 20), les deux autres
selon arbitrage ; et poser la garde dès la naissance sur toutes les tables `pos_*`.

---

# 8. Décisions nécessaires

## 8.1 Avant le LOT 27

| Réf. | Question | Décision | Statut |
| :-: | --- | --- | :-: |
| **O-1** | Neutraliser les previews Vercel des branches (§6.2) | **Ignored Build Step « production seulement » + clé de service retirée de Preview** | ✅ **APPLIQUÉE** 08/10/2026 |
| **B-8** | Un utilisateur peut-il tenir deux sessions ouvertes sur deux caisses ? | **Non** — garanti en base | 🟩 **VALIDÉE** 08/10/2026 |
| **B-9** | Seuil d'écart de caisse ? Un écart produit-il une écriture d'ajustement ? | **Aucun seuil, aucune écriture** : le système constate et journalise | 🟩 **VALIDÉE** 08/10/2026 |
| **B-13** | Un caissier voit-il ses propres montants ? | **Oui, pas ceux des autres** — policy par ligne | 🟩 **VALIDÉE** 08/10/2026 |
| **C-27** | Les 9 capacités du Plan 02 §10.2 | **Validées telles quelles → 238** | 🟩 **VALIDÉE** 08/10/2026 |
| **T-1** | Montants de session dans une table sœur (§3.4) | **Oui** — `backup_scope` 62 → **65** | 🟩 **VALIDÉE** 08/10/2026 |
| **B-12** | Affectation aux groupes système | Aucune affectation automatique — attribution manuelle, comme aux LOT 25 et 26 | recommandation, non bloquante |

## 8.2 Avant le LOT 28

| Réf. | Question | Recommandation | Bloque ? |
| :-: | --- | --- | :-: |
| **P-4** | Un paiement différé au comptoir suppose-t-il un client identifié ? | Oui | 🟥 **bloquant** (Plan 02 §3.4) |
| **D-1** | La remise PDV suit-elle DEC-051 (montant fixe KMF, ligne et/ou globale, sans plafond) ? | Oui — DEC-051 §g ne désigne pas le PDV, la décision doit le dire | 🟥 oui |
| **D-2** | Mvola, Holo, Wakati deviennent-ils disponibles aussi pour les règlements clients et fournisseurs ? | Oui (Plan 01 §16.4) | 🟧 oui |
| **B-10** | Annuler une vente d'une session close ? | Oui, avec avertissement que l'écart change | 🟧 oui |
| **B-11** | Remboursement au comptoir ? | Hors périmètre : une vente erronée s'annule | non |
| **C-2** | Origine unique d'un encaissement PDV facturé (§4.4) | Proposée par le Cloud, **validée avant le schéma** | 🟥 oui |
| **C-28** | Les 8 capacités du Plan 02 §10.2 | Validées → 246 | 🟧 oui |
| **S-1** | Correctif « née par sa fonction » sur `customer_invoices` / `customer_payments` avant le LOT 28 ? | Oui, correctif ciblé distinct | conseillé |

Les points 🟧 ont une recommandation écrite : une confirmation d'un mot suffit.

---

# 9. Ordre exact des prochaines opérations

1. ✅ La Direction valide la préparation, la méthode et les décisions du §8.1 — 08/10/2026.
2. ✅ O-1 appliquée et vérifiée — 08/10/2026.
3. Le présent dossier est commité et poussé sur `main` **sur autorisation** (le Cloud doit le lire).
   Ce push de `main` est une **épreuve utile** : il doit produire un déploiement Production READY
   (`05_O-1_Securisation_Vercel.md` §5, étape 5).
4. Lancement Cloud du LOT 27 avec `01_Prompt_Cloud_LOT_27.md` — décisions déjà intégrées.
   Au premier push de la branche, constater le déploiement `CANCELED` (§5, étape 4).
5. Reprise locale avec `02_Prompt_Local_Validation_LOT_27.md` → fusion → Rapport 21, DEC-054.
6. Décisions du §8.2 rendues ; correctif S-1 si retenu.
7. Lancement Cloud du LOT 28 avec `03_Prompt_Cloud_LOT_28.md`, **uniquement** depuis le `main`
   contenant le LOT 27 validé.
8. Reprise locale avec `04_Prompt_Local_Validation_LOT_28.md` → Rapport 22, DEC-055.

---

**PRÉPARATION — AUCUN CODE APPLICATIF · BASE NON MODIFIÉE · SEULE MODIFICATION EXTERNE : O-1 SUR VERCEL**
