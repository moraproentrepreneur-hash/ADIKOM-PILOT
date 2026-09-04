# Rapport 02 — Statistiques et rapports de facturation

**Projet :** ADIKOM PILOT — SaaS interne de gestion et de pilotage
**Entreprise :** ADIKOM Technology & Travel
**Lot :** LOT 11 — Statistiques & Rapports (Phase 3 — Pilotage, Module 07)
**Décision de référence :** DEC-034
**Date :** 4 septembre 2026
**Commit de référence :** `6102a55` (déployé et éprouvé en production)
**État :** livré, déployé, recette de production passée

---

## 1. Travail réalisé

La **Phase 3 — Pilotage** est achevée. `README` §73 et `CLAUDE.md` §61 la donnent
en quatre temps : tableau de bord (LOT 9), centre de notifications (LOT 10),
**statistiques**, **rapports**. Le LOT 11 livre les deux derniers.

Quatre capacités les attendaient au catalogue depuis la migration 007, **sans
aucun contrôle serveur** — exactement la situation de `notifications.view` avant
le LOT 10 :

| Capacité | Écran livré |
| --- | --- |
| `billing.customer.stats.view` | `/facturation/clients/statistiques` |
| `billing.customer.reports.view` | `/facturation/clients/rapports` |
| `billing.supplier.stats.view` | `/facturation/fournisseurs/statistiques` |
| `billing.supplier.reports.view` | `/facturation/fournisseurs/rapports` |

### Ce qui est livré

| Livrable | Contenu |
| --- | --- |
| **Statistiques clients** | facturé, encaissé, factures soldées / non soldées / en retard, créances et part échue, série facturé-encaissé |
| **Statistiques fournisseurs** | brut, imputé, réglé, dettes restantes et part échue, série brut-imputé-réglé |
| **Rapport clients** | état par client : factures, facturé, encaissé, reste dû, dont échu, avec total |
| **Rapport fournisseurs** | état par fournisseur : factures, brut, imputé, réglé, reste dû, dont échu, avec total |
| **Six périodes** | jour, semaine, mois, trimestre, année, **période personnalisée** (§59) |
| **Trois onglets** | Liste · Statistiques · Rapports sur chaque côté de la facturation |

### Le choix structurant : rien n'est stocké

`Module 07` §26 : les indicateurs « doivent être calculés à partir des données
réelles ».

Un chiffre d'affaires recopié dans une table devrait être tenu à jour par un
déclencheur sur chaque ligne de facture, chaque réduction, chaque règlement et
chaque annulation. **Le premier oubli produirait un total faux — et un total faux
fait autorité plus longtemps qu'un total absent.**

Chaque chiffre est donc refait à la lecture, sur les fonctions **existantes** des
factures : `customer_invoice_total`, `customer_invoice_paid`,
`supplier_invoice_gross`, `supplier_invoice_imputed`, `supplier_invoice_paid`.
Aucune arithmétique n'est réécrite — c'est la doctrine du LOT 9, étendue à la
synthèse.

### Le second choix : un flux n'est pas un stock

| Nature | Ce qui est compté | Daté de |
| --- | --- | --- |
| **Flux** | facturé | jour de la facture |
| **Flux** | encaissé | jour du règlement (`Workflow 08` §11) |
| **Flux** | imputé | jour où l'imputation est **portée** sur la facture |
| **Flux** | réglé | jour du règlement fournisseur |
| **Stock** | créances, dettes | **hors période** — ce qui reste dû aujourd'hui |

Conséquence écrite sur les écrans : sur une période, **« facturé − encaissé »
n'est pas un solde**, et « brut − imputé − réglé » n'est pas une dette. Un
encaissement de septembre peut solder une facture de juillet.

---

## 2. Migration

**`20260904000200_statistiques_et_rapports_de_facturation.sql`** — migration
**057**.

### Aucune table, aucune colonne, aucune permission

C'est le fait marquant : la migration ne crée **rien** en données. Elle contrôle
elle-même, avant de se terminer, que le catalogue est resté à **153 permissions**
et que les quatre capacités attendues y figurent.

### Huit fonctions, toutes `SECURITY INVOKER`

| Fonction | Rôle |
| --- | --- |
| `billing_require_period(from, to)` | refuse une période incomplète ou inversée |
| `billing_period_bucket(day, grain)` | premier jour du regroupement — jour, semaine (lundi), mois, trimestre, année |
| `billing_customer_stats(from, to)` | onze chiffres : quatre de flux, sept de situation |
| `billing_customer_series(from, to, grain)` | facturé et encaissé par pas de temps |
| `billing_customer_report(from, to)` | état par client — agrégat non tronqué |
| `billing_supplier_stats(from, to)` | dix chiffres : six de flux, quatre de situation |
| `billing_supplier_series(from, to, grain)` | brut, imputé et réglé par pas de temps |
| `billing_supplier_report(from, to)` | état par fournisseur — la chaîne complète |

`EXECUTE` est retiré à PUBLIC et accordé aux seules sessions authentifiées et au
rôle de service (DEC-022).

---

## 3. Fichiers

### Créés

| Fichier | Rôle |
| --- | --- |
| `supabase/migrations/20260904000200_statistiques_et_rapports_de_facturation.sql` | migration 057 |
| `supabase/tests/analytics.sql` | recette des sommes — 15 contrôles |
| `scripts/verify-analytics.mjs` | recette fonctionnelle — 82 contrôles |
| `src/lib/pilotage/figure.ts` | l'état d'un indicateur : valeur, refus nommé, échec dit |
| `src/features/billing-analytics/period.ts` | six périodes, grain, corrections annoncées |
| `src/features/billing-analytics/period.test.ts` | tests unitaires de la période |
| `src/features/billing-analytics/data.ts` | lectures, capacités exigées, onglets |
| `src/features/billing-analytics/controls.tsx` | sélecteur de période, série, avertissements |
| `src/app/(app)/facturation/clients/statistiques/page.tsx` | statistiques clients |
| `src/app/(app)/facturation/clients/rapports/page.tsx` | rapports clients |
| `src/app/(app)/facturation/fournisseurs/statistiques/page.tsx` | statistiques fournisseurs |
| `src/app/(app)/facturation/fournisseurs/rapports/page.tsx` | rapports fournisseurs |

### Déplacés

| Avant | Après | Motif |
| --- | --- | --- |
| `src/features/dashboard/kpi.tsx` | `src/components/ui/figure.tsx` | deux écrans qui posent la même question ne doivent pas y répondre de deux façons (`CLAUDE.md` §37) |

`Figure`, `Kpi`, `Denied`, `LoadError`, `AlertRow` et `pick` sont nés avec le
tableau de bord. Les statistiques posent exactement la même question — un chiffre,
un refus nommé, ou un échec dit — et les recopier en aurait fait **deux vérités
sur la façon de ne pas répondre**. Le tableau de bord n'est pas modifié pour
autant : sa recette de production le vérifie (55 contrôles, inchangés).

### Modifiés

| Fichier | Modification |
| --- | --- |
| `src/features/dashboard/data.ts` | importe les outils partagés ; le type `Figure` reste réexporté sous son nom d'origine |
| `src/app/(app)/tableau-de-bord/page.tsx` | importe `figure.tsx` et `pick` partagés |
| `src/app/(app)/facturation/clients/page.tsx` | onglets Liste · Statistiques · Rapports |
| `src/app/(app)/facturation/fournisseurs/page.tsx` | idem |
| `src/features/customer-invoices/data.ts` | `clientLabel` et `RawClient` exportés — une seule composition du nom |
| `src/features/supplier-invoices/data.ts` | `supplierLabel` exporté, même raison |
| `package.json` | `db:verify:analytics`, `verify:analytics` |
| `01_Developpement/adikom-pilot/README.md` | scripts, arborescence, règles **2 quater** et **2 quinquies** |
| `00 Documentation/08_Decisions/01_Journal_des_Decisions.md` | DEC-034 et un arbitrage ouvert |

---

## 4. Règles métier appliquées

### `Module 07` §26 — statistiques clients

« Total facturé, total encaissé, total restant, factures payées, impayées, en
retard, paiements par période. » Les sept sont livrés. Seules les factures
**émises** comptent : un brouillon ne reconnaît aucune créance (`Workflow 07`
§25), une annulée n'a jamais produit de chiffre d'affaires.

### `Module 07` §58 — tableau de synthèse fournisseurs

« Total facturé, total imputé, total payé, dettes restantes, factures en
retard. » Seules les factures **validées** portent une dette. `PAID` et
`PARTIALLY_PAID` ne s'écrivent jamais : ils se calculent (DEC-029), et une
facture soldée sort d'elle-même par son reste.

### `CLAUDE.md` §16 et §57 — une imputation n'est pas un paiement

```
Brut       1 000 000 KMF
Imputé       300 000 KMF   ← n'est pas un règlement
Net          700 000 KMF
Réglé        200 000 KMF
Reste dû     500 000 KMF
```

Les deux recettes éprouvent cette chaîne sur les montants exacts de la
documentation, et vérifient qu'**imputé et réglé restent deux colonnes
distinctes**.

### `Workflow 08` §11 — la date du règlement n'est pas celle de la facture

La recette pose la facture à J−20 et le règlement au jour même, puis vérifie que
la journée du règlement ne compte **aucune** facture, et réciproquement.

### `Module 07` §59 — six périodes

Les cinq périodes civiles sont celles du tableau de bord, **non recalculées** :
`resolvePeriod` en reste la seule vérité. La **période personnalisée** est
l'ajout du lot. Le **grain** de la série se déduit de l'étendue et n'est jamais
un choix d'affichage : il décide de ce que chaque point agrège.

### `Module 07` §27 et §60 — des états, pas des extraits

Les rapports sont des **agrégats non tronqués** : une liste coupée à 200 lignes
produirait un état dont les lignes ne font pas le total affiché en bas. La
recette vérifie le recoupement ligne à ligne avec la statistique.

### `Navigation` §10.1 et §10.2 — des sous-menus

« Statistiques » et « Rapports » sont des troisièmes niveaux. La barre latérale
s'arrête au menu ; ses troisièmes niveaux sont des pages, comme « Nouvelle
facture » ou les catégories du parc (**DEC-021 §6**, qui autorise l'adaptation de
l'organisation des menus). Ils sont donc atteints par des **onglets**, et la
période suit l'utilisateur d'un onglet à l'autre.

---

## 5. Permissions et sécurité

### Aucune permission créée — le catalogue reste à 153

Les quatre capacités existaient déjà. En créer une de plus — `.export`,
`.download`, `.print` — serait interdit tant que la fonctionnalité correspondante
n'existe pas et n'a pas été validée (**DEC-024**). La migration vérifie
elle-même le compte avant de se terminer, et trois recettes le revérifient.

### Les capacités composent, elles n'ouvrent rien

`billing.customer.stats.view` autorise l'**écran**, pas les données qu'il résume.
`billing.customer_invoices.view` reste exigée en plus, nommément.

### Une synthèse sans toutes ses lectures se TAIT

| Capacités détenues | Résultat |
| --- | --- |
| stats + factures clients, **sans** règlements clients | **refus** — l'encaissé vaudrait 0, toute facture se lirait impayée |
| stats + factures fournisseurs + règlements, **sans** imputations | **refus** — le net vaudrait le brut : 1 000 000 KMF réclamés là où ADIKOM en doit 700 000 |

Et l'écran **nomme la permission manquante** : il n'affiche jamais un zéro à la
place d'un refus (DEC-017). La recette de production l'éprouve écran par écran,
et vérifie qu'aucun « 0 KMF » n'apparaît.

### Le nom d'un tiers peut manquer sans que le montant soit faux

Sans `parties.clients.view`, le rapport affiche « Client non lisible » et **les
montants restent justes** : ils ne dépendent pas du répertoire. La distinction
est délibérée — une omission qui produirait un **mensonge** fait taire la
fonction ; une omission qui produit une **absence** se dit.

### La garde est serveur

- les quatre pages appellent `requirePermissionOrRedirect` : l'URL tapée à la
  main aboutit à `/acces-refuse`, avec la permission requise nommée ;
- les six fonctions de lecture **refusent l'appel direct** par PostgREST ;
- `EXECUTE` est retiré à PUBLIC : la clé publique seule n'exécute aucune des six
  (DEC-022).

Les trois barrières sont éprouvées séparément par la recette.

### Aucune écriture

Une statistique lit. La recette vérifie qu'après consultation des six fonctions,
**aucun statut n'a bougé** et **aucune entrée d'audit n'a été produite**.

---

## 6. Tests

### Recette SQL — `npm run db:verify:analytics`

**15 contrôles, tous réussis.** Transaction annulée : aucun résidu.

| # | Contrôle |
| --- | --- |
| 1 | aucune statistique stockée — ni table, ni colonne de cache |
| 2 | huit fonctions `SECURITY INVOKER`, non volatiles, `search_path` figé, fermées à PUBLIC |
| 3 | chaque synthèse nomme **toutes** les lectures dont elle dépend (21 couples fonction/capacité) |
| 4 | catalogue à 153, les quatre capacités présentes |
| 5 | période incomplète, inversée et grain inconnu : refusés avec leur motif ; semaine au lundi, trimestre et année bien bornés |
| 6 | facture client de 450 000 KMF émise, échéance dépassée |
| 7 | facturé : brouillon et annulée exclus, bornes de période incluses |
| 8 | encaissé compté à **sa** date ; créance 250 000, échue ; annulation d'un règlement rendue |
| 9 | facture soldée : sortie des créances, jamais dite en retard |
| 10 | la série **détaille** le total sans le contredire, quel que soit le grain |
| 11 | rapport clients : la somme des lignes fait le total |
| 12 | dette = brut − imputé − payé : **500 000 KMF, jamais 1 000 000** |
| 13 | brouillon fournisseur : aucune dette, aucun facturé |
| 14 | rapport fournisseurs : la chaîne brut → imputé → payé → reste dû |
| 15 | lire ne déplace aucun statut et n'écrit aucune entrée d'audit |

### Tests unitaires — `npm run test`

**135 tests, tous réussis** (8 fichiers), dont **17 nouveaux** sur la période :
jour civil réel (`2026-02-30` refusé), étendue, grain, période personnalisée
valide, inversée, incomplète, clé bricolée, étiquettes de pas, reconduction dans
l'URL.

### Recette fonctionnelle — `npm run verify:analytics`

**82 contrôles, tous réussis**, dans un navigateur, contre la production, avec
cinq profils réels :

| Profil | Ce qu'il éprouve |
| --- | --- |
| `analyste` | les quatre écrans, chiffres **identiques à ceux que la base rend au rôle de service** |
| `sansReglements` | aucun montant, permission nommée, appel direct refusé |
| `sansImputations` | la dette n'est pas gonflée du brut — elle n'est pas affichée |
| `sansTiers` | « non lisible », et les montants restent justes |
| `listeSeule` | onglets absents, URL refusée, trois appels directs refusés |

Plus la clé publique seule : les six fonctions hors de portée.

---

## 7. Non-régressions

Toutes passées **contre la production déployée** (`6102a55`).

### Recettes fonctionnelles — 1 199 contrôles, aucun échec

| Recette | Contrôles |
| --- | --- |
| `verify:users` | 14 |
| `verify:referential` | 31 |
| `verify:documents` | 42 |
| `verify:partners` | 45 |
| `verify:reservations` | 35 |
| `verify:rentals` | 34 |
| `verify:checkout` | 36 |
| `verify:rental-live` | 35 |
| `verify:rental-return` | 51 |
| `verify:dashboard` (tableau de location) | 30 |
| `verify:rental-documents` | 58 |
| `verify:incidents` | 39 |
| `verify:maintenance` | 54 |
| `verify:maintenance-costs` | 29 |
| `verify:imputations` | 47 |
| `verify:payments` (fournisseurs) | 32 |
| `verify:supplier-invoices` | 37 |
| `verify:treasury` | 34 |
| `verify:customer-invoices` | 52 |
| `verify:customer-payments` | 36 |
| `verify:pilotage` | 55 |
| `verify:notifications` | 85 |
| **`verify:analytics`** | **82** |
| `verify:capabilities` | 206 |
| **Total** | **1 199** |

### Recettes SQL — 238 contrôles, aucun échec

`socle` 18 · `location` 20 · `rental_cycle` 14 · `incidents` 12 · `maintenance`
17 · `maintenance_costs` 14 · `imputations` 22 · `supplier_invoices` 21 ·
`treasury` 19 · `customer_invoices` 20 · `customer_payments` 18 · `dashboard`
13 · `notifications` 15 · **`analytics` 15**.

### Total de la recette de production

**1 437 contrôles, aucun échec**, plus **135 tests unitaires**.

### Recettes non exécutables dans cet environnement — à signaler

Six recettes exigent les identifiants du Super Admin (`ADIKOM_ADMIN_EMAIL`,
`ADIKOM_ADMIN_USERNAME`), absents du poste de développement. Elles se sont
arrêtées **avant tout contrôle**, sur un message de variable manquante — ce n'est
donc **ni un succès ni un échec**, et elles ne sont comptées nulle part :

`verify:auth` · `verify:login` · `verify:users:ui` · `verify:permissions` ·
`verify:corrections` · `verify:referential:ui`.

Aucune ne porte sur le périmètre du LOT 11. Elles restent à passer sur un poste
disposant de ces identifiants.

### Chaîne de qualité — `npm run verify`

`lint` · `typecheck` · `test` · `build` : **tous verts**, aucun avertissement.

---

## 8. GitHub

| | |
| --- | --- |
| Dépôt | `moraproentrepreneur-hash/ADIKOM-PILOT` |
| Branche | `main` |
| Commit | **`6102a55`** — « feat: la facturation dit ce qu elle a produit, et ce qu on lui doit encore » |
| Fichiers | 22 modifiés · 5 171 insertions · 59 suppressions |
| Secrets | aucun — `.env.local` reste ignoré, `.env.example` ne porte que des libellés |

---

## 9. Vercel

| | |
| --- | --- |
| Projet | `adikom-pilot` (`prj_jou6Q0zXnOm9rcAzLLniAusCqpNP`) |
| Production | **https://adikom-pilot.vercel.app** |
| État | **READY** |
| Commit déployé | **`6102a55`** — vérifié par l'API REST (`meta.githubCommitSha`) |

Les quatre nouvelles routes figurent au manifeste de build, toutes dynamiques :

```
ƒ /facturation/clients/statistiques
ƒ /facturation/clients/rapports
ƒ /facturation/fournisseurs/statistiques
ƒ /facturation/fournisseurs/rapports
```

---

## 10. Données DEMO et résidus

Contrôle final exécuté **après** la totalité de la recette de production :

| Contrôle | Résultat |
| --- | --- |
| Comptes de recette restants | **0** |
| Clients / fournisseurs / véhicules de recette | **0** |
| Factures clients et fournisseurs de recette | **0** |
| Comptes financiers et catégories de recette | **0** |
| Clients DEMO | **3** — intacts |
| Véhicules DEMO | **3** — intacts |
| Fournisseurs DEMO | **3** — intacts |
| Catalogue | **153 permissions** |

---

## 11. Défauts trouvés et corrigés

### 11.1 — Une recette tuée par `head` laisse tout derrière elle

**Constaté.** Une exécution intermédiaire de `verify:analytics` a été redirigée
vers `head`. `head` ferme le tuyau dès qu'il a ses lignes, `SIGPIPE` tue le
script **avant son bloc de nettoyage**, et vingt-deux objets sont restés dans
Supabase Cloud — dont une facture client de 450 000 KMF qui a faussé la mesure
suivante (900 000 au lieu de 450 000).

**Corrigé.** Balayage par marqueur et suppression complète, puis contrôle à zéro.
Toutes les exécutions suivantes écrivent dans un fichier, jamais dans un tuyau.

**Ce que le lot en retient.** La recette compte désormais elle-même ses résidus
après nettoyage, et **un résidu non supprimé compte comme un échec** : un
nettoyage silencieux qui échoue est pire qu'un nettoyage absent.

### 11.2 — Une mise en place dont on ignore les erreurs

**Constaté.** Les appels de construction du jeu de recette ignoraient leur
erreur. Quatre paramètres portaient un nom inexact — `p_account_number` pour
`p_account_reference`, `p_notes` pour `p_description`, `p_reference` pour
`p_justification`, `p_labour`/`p_parts`/`p_imputable` pour
`p_estimated_cost`/`p_actual_cost`/`p_imputable_amount`. La facture restait en
brouillon, l'imputation n'était jamais portée, et **dix-neuf contrôles
échouaient pour une raison qui n'était pas la leur**.

**Corrigé.** Un utilitaire `rpc()` **arrête la recette** dès qu'un appel de mise
en place échoue. Un sujet à moitié construit ne produit plus de faux échecs.

### 11.3 — Une table d'audit nommée au pluriel

**Constaté.** La recette SQL interrogeait `public.audit_logs` ; la table
s'appelle `public.audit_log`.

**Corrigé.** Le contrôle « lire n'écrit rien » porte désormais sur la bonne
table — et il passe.

### Aucun défaut trouvé dans les lots précédents

Le tableau de bord, le centre de notifications, les factures clients et
fournisseurs, la trésorerie et les imputations passent leurs recettes de
production sans modification.

---

## 12. Arbitrages ouverts

Aucun arbitrage n'a été inventé. Le journal des décisions en compte désormais
**seize**, dont **un nouveau**.

### Nouveau — DEC-034 §h

> **Un rapport doit-il pouvoir être exporté, téléchargé ou imprimé ?**
>
> `Module 07` §60 : « les formats d'export pourront être définis lors de
> l'implémentation » — c'est-à-dire qu'ils ne le sont pas. Aucune capacité du
> catalogue ne couvre l'export d'un **état** :
> `billing.customer_invoices.export` porte sur la **liste des factures**, et
> **DEC-024** interdit d'en déduire le droit d'exporter un rapport.
>
> Produire un tableur ou un PDF suppose donc de créer
> `billing.customer.reports.export` et son équivalent fournisseur. La capacité
> est **proposée, non créée** — conformément à `CLAUDE.md` §19 bis, étape 2.

### Rappelés, non tranchés

- **DEC-014** — régime de taxes. Les totaux restent ceux des factures, tels que
  le système les connaît.
- **DEC-033 §b** — seuil de montant d'une facture « importante » en retard. La
  question vaut aussi pour la mise en avant d'un état.
- **DEC-032 §h** — disposition du pilotage selon le métier, et activité récente.

### Ce que le lot ne fait pas, et pourquoi

| Non livré | Motif |
| --- | --- |
| Export, PDF, impression d'un état | aucune capacité au catalogue — DEC-034 §h |
| État des paiements divers | module non livré ; une colonne vide se lirait « aucun » |
| Statistiques de location, de parc, de maintenance | citées comme évolutions ; la Phase 3 documentée porte sur le pilotage financier |
| Comparaison entre deux périodes | non documentée ; l'inventer supposerait d'en arrêter la règle |

---

## 13. Ce que la Phase 3 laisse derrière elle

| Lot | Objet | État |
| --- | --- | --- |
| LOT 9 | Tableau de bord — *où en est l'entreprise* | livré |
| LOT 10 | Centre de notifications — *ce que je dois savoir ou faire* | livré |
| **LOT 11** | **Statistiques et rapports — *ce qui a été produit, ce qui reste dû*** | **livré** |

La **Phase 4 — Organisation** est la suite documentée : Projets & Planification,
groupes, vue hiérarchique, journal d'activité, paramètres.

---

**ADIKOM PILOT — Rapport 02**

> Rien n'est stocké : un total recopié finit par mentir.
> Un flux se date de son acte ; un stock ignore la période.
> Une somme sans toutes ses lectures se tait, et dit pourquoi.
