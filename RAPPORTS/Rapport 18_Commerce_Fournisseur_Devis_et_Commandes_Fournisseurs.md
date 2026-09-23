# Rapport 18 — Commerce fournisseur : devis et commandes fournisseurs

## LOT 26 · Module 11 · DEC-052

**Date :** 23 septembre 2026
**Entreprise :** ADIKOM Technology & Travel
**Projet :** ADIKOM PILOT
**Sources :** Plan 02 §6, §7.1, §9.1–9.2, §9.5, §10.2, §13.2, §18.2 · Plan 01 §15.3–15.5, §17.2, §23 · Décisions Direction **A-13**, **A-14**, **B-6**, **B-7**, **B-14** · DEC-006, DEC-010, DEC-013, DEC-017, DEC-023, DEC-024, DEC-038, DEC-043, DEC-044, DEC-046, DEC-049, DEC-052

---

# 1. Objectif

Livrer la **couche commerciale du côté ACHAT** — devis fournisseurs et commandes
fournisseurs — et l'**articuler** avec la facturation fournisseur déjà en
production, sans en réécrire aucune brique.

```
CATALOGUE DE SERVICES (LOT 20)
        ▼
 DEVIS FOURNISSEUR ──retenu──▶ COMMANDE FOURNISSEUR ──passée──▶ FACTURE F. (LOT 5)
   (offre REÇUE,               (liée à l'offre)                        ▼
    conservée)                                          RÈGLEMENT FOURNISSEUR (LOT 6)
                                                                       ▼
                                                              TRÉSORERIE (LOT 6)
```

Le lot devait démontrer quatre choses, et il les démontre :

1. **Un devis fournisseur est un document REÇU** — ADIKOM enregistre l'offre
   d'un fournisseur, elle ne lui émet rien. Le vocabulaire du commerce client
   n'a pas été recopié.
2. **Le prix vient de l'offre, jamais du catalogue** — et **P-5 sort du lot
   intact**. Le commerce fournisseur fonctionne sans l'avoir tranché.
3. **Aucun système parallèle** — une facture née d'une commande est une
   `supplier_invoices` ordinaire, et rien d'autre. **Aucun mouvement de
   trésorerie** au devis ni à la commande.
4. **Les coûts d'achat sont gardés** — et ici, `view` **est** la barrière : un
   devis fournisseur n'est qu'un prix d'achat.

---

# 2. État initial

| | |
| --- | --- |
| Branche | `main` |
| SHA de départ | `274ce59` |
| Arbre de travail | propre |
| Migrations appliquées | **100**, dernière `20260923000400` |
| Catalogue | **213** capacités |
| Périmètre de sauvegarde | **58** tables |
| Production | `https://adikom-pilot.vercel.app` · READY sur `274ce59` |

---

# 3. Sauvegarde préalable — étape bloquante, honorée

`npm run backup:snapshot -- LOT26`, **avant la première migration** :

```
[OK] Le fichier existe et porte des octets                 160 Kio
[OK] Format reconnu par admin_restore_backup               adikom-pilot.sauvegarde
[OK] Version du format présente                            v1
[OK] Horodatage présent                                    2026-09-23T11:39:11+00:00
[OK] La configuration voyage avec les données              18 règles de numérotation
[OK] Les 58 tables du périmètre figurent dans le fichier
[OK] Chaque table porte exactement ses lignes de la base    204 lignes
[OK] Le total annoncé par le fichier est celui de la base   204 / 204
```

Fichier conservé **hors du dépôt** :
`SAUVEGARDES_ADIKOM/adikom-pilot-LOT26-2026-09-23T11-39-12.json`.

Le fichier a été **relu** et ses compteurs **comparés table par table** à la
base : un fichier présent n'est pas une sauvegarde exploitable.

---

# 4. Analyse de l'existant — ce qui a été lu avant d'écrire

| Source | Ce qu'elle a tranché |
| --- | --- |
| **Plan 02 §9.1** | Les quatre tables : `purchase_quotes`, `purchase_quote_lines`, `purchase_orders`, `purchase_order_lines` — **confirmées contre le code réel** |
| **Plan 02 §9.2** | Les **cinq** colonnes ajoutées, toutes nullables, et **pas une sixième** |
| **Plan 02 §9.5** | **Une seule paire d'énumérations** pour les quatre tables du commerce |
| **Plan 02 §10.2** | Huit actions par menu. **Aucune capacité de montants** |
| **Plan 02 §13.2** | Périmètre de sauvegarde : **+4 tables** |
| **Plan 02 §18.2** | Le critère du LOT 26 : « `amount = quantity × unit_price` **garanti par la base** » |
| **Plan 01 §15.3–15.4** | « Même structure, symétrique », `unit_price` = prix d'achat, **aucune marge** |
| **Plan 01 §15.5** | `DEV-F` / `CDE-F` · la contrainte de cohérence de `supplier_invoice_lines` · **décision B-6** |
| **Plan 01 §17.2** | Menus `purchase_quotes` (3), `purchase_orders` (4) |
| **Module 07 §28, §30, §54** | Une facture fournisseur est **reçue** ; sa référence externe est **distincte** du numéro interne ; son montant brut **doit être conservé** |
| **Module 04 §9, §19** | Le statut d'un tiers « doit être pris en compte lors des nouvelles opérations » |
| **Règles finance §8**, **Règles fournisseurs §2**, **Workflow 08** | Relus pour y chercher une règle d'acompte fournisseur : **il n'y en a aucune** (§12) |
| **Code réel** | `supplier_invoices`, `supplier_invoice_lines`, `supplier_payments`, `treasury_entries`, `service_variant_costs`, `supplier_vehicle_rates`, et les quatre tables du LOT 25 |

## 4.1 Ce que l'inspection du code a corrigé par rapport au Plan

| Le Plan supposait | Le code réel | Conséquence |
| --- | --- | --- |
| Des enums propres au commerce fournisseur | `commercial_document_status` et `order_status` existent, **sans préfixe de domaine** | **Réemployées** (§6.2) |
| — | `fn_commercial_document_starts_draft` lit `new` par `to_jsonb` | **Branchée telle quelle**, non réécrite |
| — | `fn_supplier_invoice_transition` a été **révisée** par la migration 052, pas seulement créée par la 048 | Reprise de **sa dernière version active** (leçon du LOT 22) |
| — | `service_variants` n'a **pas** de colonne `variant_no` ; la variante par défaut est posée par un déclencheur | Recettes corrigées avant exécution |
| — | `payment_method` porte `BANK_TRANSFER`, non `TRANSFER` | Recette corrigée (§14.2) |

---

# 5. Décisions appliquées

| Réf. | Décision | Application |
| :-: | --- | --- |
| **A-13** | Lignes libres autorisées | **Étendue par sa propre portée, non par analogie** (§7.3) |
| **A-14** | Permissions indépendantes par action | 16 capacités, **quatre** menus étanches |
| **B-6** | Aucune réception documentée | `DELIVERED` est un statut, jamais un bon de réception |
| **B-7** | Un devis expiré ne change pas de statut | Péremption **dérivée** de `valid_until`, jamais écrite |
| **B-14** | Quantité entière | `integer` avec `check (> 0)` |
| **DEC-006** | Deux entités, deux jeux de statuts | Le devis n'est pas une commande à un statut près |
| **DEC-010** | Montants entiers en KMF | `bigint`, aucun flottant nulle part |
| **DEC-013** | Imputation ≠ paiement | Aucun mécanisme d'imputation ni de paiement n'est créé |
| **DEC-017** | Ce qu'on ne peut pas lire se **dit**, ne se tait pas | Éprouvé sur quatre écrans et deux documents |
| **DEC-023** | Convention des références | `DEV-F` / `CDE-F`, format **provisoire** comme `FAC-F` |
| **DEC-024** | Capacités distinctes | `download` ≠ `print` ≠ `export` ≠ `view`, éprouvé par l'écran **et** par appel direct |
| **DEC-038** | Le journal n'ouvre pas ce que la table ferme | Quatre correspondances, chacune sur la capacité de **son** menu |
| **DEC-044** | Confidentialité des coûts d'acquisition | **Les deux lectures sont marquées sensibles** (§11.2) |

## 5.1 Ce que le Plan 01 prévoyait, et ce qui est livré

| Le Plan 01 prévoyait | Ce qui est livré | Pourquoi |
| --- | --- | --- |
| `unit_cost` sur la ligne | **aucune colonne de coût** | Le Plan 02 §9.3 l'en retire ; ici le prix **est** le coût d'achat, et il est nommé `unit_price` |
| `discount_amount` par ligne | **aucune remise** | Le Plan 02 ne le reprend pas, et **aucune capacité ne la garderait** (A-14) |
| une fonction de marge | **absente** | « On n'a pas de marge sur un achat » (§15.3) |
| `source_order_line_id` sur la facture | **absent** | Le Plan 02 §9.2 énumère **quatre** colonnes pour `supplier_invoice_lines`, sans celle-là (§13.3) |

---

# 6. Architecture

## 6.1 Schéma réel — quatre tables créées

| Table | Rôle |
| --- | --- |
| `purchase_quotes` | L'offre REÇUE : n° interne, **référence du fournisseur**, fournisseur, date, validité, statut, traces d'actes |
| `purchase_quote_lines` | Ses lignes : service et variante **facultatifs**, désignation, quantité, **prix de l'offre** — tous figés |
| `purchase_orders` | La commande : n°, fournisseur, **offre d'origine facultative**, date, réception attendue, statut |
| `purchase_order_lines` | Ses lignes, plus `source_quote_line_id` |

## 6.2 🟥 Les énumérations sont RÉEMPLOYÉES, et c'est une décision

Plan 02 §9.5 crée `commercial_document_status` et `order_status`, et **n'en
prévoit aucune autre** pour les quatre tables du LOT 26. Elles portent d'ailleurs
des noms **délibérément génériques** là où tout le reste du LOT 25 s'appelle
`sales_`.

**Réemployer un TYPE n'est pas partager une valeur métier.** DEC-006 refuse
qu'une réservation et une location partagent un jeu de statuts parce que ce sont
deux **entités** ; ici, il s'agit du même **type de données** appliqué à deux
entités distinctes, dans deux tables distinctes, sous deux jeux de déclencheurs
et de capacités distincts.

**Ce qui diffère, c'est le libellé** — et il vit dans l'application :

| Code | Devis **client** | Devis **fournisseur** |
| --- | --- | --- |
| `SENT` | Émis | 🟥 **Reçu** |
| `ACCEPTED` | Accepté | **Retenu** |
| `REFUSED` | Refusé | **Écarté** |
| `DELIVERED` | Livrée | 🟥 **Réceptionnée** |
| `CONFIRMED` | Confirmée | **Passée** |

Un test unitaire **refuse explicitement** que les deux tables de libellés se
confondent : un écran qui dirait « Émettre le devis » à quelqu'un qui enregistre
l'offre d'un fournisseur serait faux.

## 6.3 Colonnes ajoutées à des tables existantes — Plan 02 §9.2

| Table | Colonne | Nullable |
| --- | --- | :-: |
| `supplier_invoices` | `purchase_order_id` | ✅ |
| `supplier_invoice_lines` | `service_id` | ✅ |
| `supplier_invoice_lines` | `service_variant_id` | ✅ |
| `supplier_invoice_lines` | `quantity` | ✅ |
| `supplier_invoice_lines` | `unit_price` | ✅ |

**Aucune donnée existante n'est modifiée.** Les 225 factures fournisseurs déjà
en base reçoivent `NULL` partout et se comportent exactement comme avant.

🟥 **`amount` reste l'unique source du montant brut (D1).** Plan 01 §15.5 :
« ajouter `quantity` et `unit_price` créerait **deux sources du même chiffre** ».
La décomposition, **quand elle existe**, est vérifiée par la base :

```sql
check ( (quantity is null and unit_price is null)
     or (quantity > 0 and unit_price > 0
         and amount = quantity::bigint * unit_price) )
```

C'est le critère que Plan 02 §18.2 exige nommément du LOT 26. La fonction
d'ajout **calcule** `amount` et **refuse** qu'on le fournisse en même temps que
la décomposition — trois refus éprouvés en recette.

---

# 7. 🟥 Le prix d'une ligne d'achat — la règle s'inverse

## 7.1 Ce qui est livré

> **Sur une ligne d'achat, le prix est TOUJOURS SAISI — ligne de catalogue
> comprise. C'est le prix que CE fournisseur propose, sur CET acte.**

Côté client, le prix d'une ligne de catalogue est **résolu du catalogue** et un
prix saisi y est **refusé** : ce serait une remise déguisée. **Ici, la règle
s'inverse**, et ce n'est pas une facilité.

## 7.2 🟥 P-5 reste ouvert, et le lot ne l'a pas tranché

`service_variant_costs` porte **une** valeur par variante et par date, **sans
dimension fournisseur**. C'est exactement le point **P-5** — « un service a-t-il
un prix d'achat unique, ou un prix par fournisseur ? » (Plan 02 §15).

Résoudre ce coût et l'imposer à la ligne ferait passer **une valeur interne pour
une offre reçue**, et **trancherait P-5 par un défaut d'implémentation**.

| | Coût de **référence** | Prix **fournisseur** |
| --- | --- | --- |
| Où | `service_variant_costs` | `purchase_*_lines.unit_price` |
| Combien | **une** valeur par date | **une par offre**, par fournisseur |
| Gardé par | `catalog.services.cost.view` | `commerce.purchase_*.view` |

🟥 **`service_variant_costs` n'a reçu ni `supplier_id`, ni aucune autre
colonne.** La migration 101 refuse de s'appliquer si c'est le cas, et la recette
SQL le revérifie.

**La démonstration, en production** : le catalogue dit 40 000 ; ce fournisseur
propose 52 000 ; la ligne porte **52 000**. Le catalogue est ensuite porté à
70 000 — l'offre, la commande et la facture restent à **52 000**.

## 7.3 🟩 A-13 s'applique — et c'est la documentation qui le dit

La question A-13 (Plan 01 §23) ne parle **ni du client ni du fournisseur** :
« **un devis / une commande** peut-il porter une ligne libre, sans service au
catalogue ? — **Oui**, `service_id` nullable ». Et le Plan 01 §15.3–15.4 décrit
les quatre tables comme « **même structure, symétrique** ».

**A-13 n'a donc pas été étendue par ressemblance : elle était générale, et ces
tables sont celles qu'elle visait.** Aucun service « Divers » n'est créé.

## 7.4 Le repère, et seulement un repère

L'éditeur de lignes **affiche** le coût de référence à la date du document, avec
l'écart — « voici ce que nous payons d'habitude ».

- il n'est **jamais recopié** dans le champ de saisie ;
- il n'est montré qu'à qui détient **`catalog.services.cost.view`**, et l'écran
  **dit** pourquoi la case est vide sinon (DEC-017) ;
- il **n'entre dans aucun document, aucun export, aucune ligne enregistrée**.
  Le balayage des sources documentaires refuse **jusqu'à son nom de variable**
  (`referenceCost`), ajouté aux termes interdits.

**Tout le parcours de recette a été joué par un acheteur qui ne détient PAS
cette capacité** : le lot fonctionne sans elle.

---

# 8. Cycles de vie

## 8.1 Le devis fournisseur

```
BROUILLON ──enregistrer──▶ REÇU ──retenir──▶ RETENU ──convertir──▶ CONVERTI
    │                       │                  │
    │                       └──écarter──▶ ÉCARTÉ│
    └───────────────────────┴──────────────────┴──annuler──▶ ANNULÉ
```

`validate` fait **avancer l'offre** — l'enregistrer, la retenir, l'écarter :
c'est le même geste, la décision d'ADIKOM. `cancel` **retire
l'enregistrement** — une offre écartée n'est pas une offre annulée.

**Ce qui se fige à l'enregistrement** : fournisseur, date, validité, numéro,
devise, **référence externe** et **conditions**. Les observations restent
annotables, **mais exigent `update` dans tous les états** — la leçon de la
migration 100, appliquée d'emblée plutôt que corrigée après coup.

## 8.2 La commande fournisseur

```
BROUILLON ──passer──▶ PASSÉE ──réceptionner──▶ RÉCEPTIONNÉE
                         │                          │
                         └────────facturer──────────┴──▶ FACTURÉE
                                                          │
   (annulation de la facture)  ◀──────────────────────────┘
```

🟩 **B-6 : la réception n'est PAS un document.** Elle se constate par le passage
à `DELIVERED`, et une commande simplement **passée** se facture aussi bien.

---

# 9. La conversion — un acte nouveau, l'ancien intact

L'offre **n'est pas transformée** : une commande **naît**, l'offre passe à
« converti » et reste consultable **telle que le fournisseur l'a remise**, avec
**sa référence**. Les lignes sont **recopiées**, jamais relues du catalogue, et
portent `source_quote_line_id`.

**Une offre ne produit pas deux commandes** — éprouvé trois fois : par la
fonction, par un `INSERT` direct, et par **deux conversions simultanées** dont
une seule aboutit.

**L'annulation ne crée aucune impasse** : la facture annulée rend la commande à
« passée » ; la commande annulée rend l'offre à « retenue », `converted_at`
effacé. Et le prix reste **52 000** après tout ce parcours.

---

# 10. La facturation — aucun système parallèle

## 10.1 L'orchestrateur

`create_invoice_from_purchase_order` **n'écrit elle-même aucune ligne** : elle
appelle `create_supplier_invoice` puis `add_supplier_invoice_line`, qui portent
déjà leurs cinq couches de contrôle.

La facture née d'une commande est une `supplier_invoices` **ordinaire** : même
numérotation `FAC-F`, même écran, même cycle, mêmes imputations, mêmes règlements
partiels, mêmes écritures de trésorerie.

**Elle naît en BROUILLON.** La soumettre puis la **valider** restent des actes
distincts : c'est la validation qui **reconnaît la dette**.

## 10.2 🟥 Une facture reçue CONSTATE — elle n'exécute pas la commande

| | Côté client | Côté fournisseur |
| --- | --- | --- |
| La facture | **exprime** l'engagement d'ADIKOM | **constate** ce que le tiers réclame |
| Son montant | celui de la commande | celui du **document reçu** (Module 07 §28, §54) |

**Rien n'oblige les deux totaux à coïncider.** Les lignes sont recopiées pour
épargner une ressaisie, et restent modifiables tant que la facture est en saisie.
La fiche de la commande **affiche l'écart** ; elle ne le corrige pas. Le forcer
reviendrait à **réécrire un document reçu**.

## 10.3 🟥 Aucun mouvement de trésorerie avant le règlement

Une **photographie** de tout ce qu'un acte financier toucherait — factures,
lignes, règlements, écritures, sommes — est prise **avant**, reprise **après**
la création d'une offre, sa conversion et le passage de la commande. **Aucun
terme ne bouge.**

La trésorerie n'a **reçu aucune origine d'achat** : les colonnes qui le
permettraient n'existent pas, et la recette le vérifie. **Une imputation n'est
toujours pas un paiement** (CLAUDE.md §57).

En production : règlement partiel de **100 000 KMF** sur 261 000 → **une** écriture
`OUT` de 100 000, solde **161 000**, et le statut reste `VALIDATED` — « partiellement
payée » se **calcule**, elle ne s'écrit pas (acquis du LOT 6, vérifié).

---

# 11. Capacités — 16, catalogue 213 → 229

Module `commerce`, **le même**, ordre 11. Menus `purchase_quotes` (3) et
`purchase_orders` (4). Huit actions chacun.

🟥 **AUCUN SECOND MODULE « ACHATS »** : le Plan 02 §7.1 place les quatre menus
sous Commerce, et la migration refuse tout rattachement ailleurs.

## 11.1 Ce qui n'est pas créé

`commerce.purchase_*.invoice` · `.convert` · `.amounts.view` · `.discount` ·
`.margin` · `.cost` — chacune motivée au Module 11 §24.1.

## 11.2 🟥 Les deux lectures sont marquées SENSIBLES

Un devis fournisseur ne porte **rien d'autre** que ce que le fournisseur
demande : lui retirer ses montants ne laisserait qu'un nom et une date.

Le Plan 02 §10.2 ne prévoit donc **aucune capacité de montants** pour ces menus —
contrairement aux sessions de caisse (LOT 27), où `pos.sessions.view` répond à
« **qui** était en caisse » sans dire « **combien** ». **Là, la séparation ouvre
quelque chose ; ici, elle ne laisserait rien.**

`commerce.purchase_quotes.view` et `commerce.purchase_orders.view` sont donc
marquées **sensibles**, comme `catalog.services.cost.view` et
`rental.pricing.supplier.view` (Plan 02 §6, DEC-044).

**Ce n'est pas une capacité de plus** : c'est le **drapeau** que porte une
capacité déjà prévue. Il ne change aucun droit — il **dit** à l'écran
d'attribution ce que cette attribution engage.

---

# 12. 🟦 Une commande, au plus une facture — la règle, et la question posée

🟥 **Ce point n'a PAS été tranché par symétrie avec DEC-050**, qui porte
expressément sur la commande **client**. Il est **déduit de l'architecture
documentée** :

1. Plan 02 §9.2 ajoute `supplier_invoices.purchase_order_id` — **une** colonne ;
2. `order_status` porte `INVOICED` et **aucun état partiel**, et il est
   **partagé** : c'est un statut de la commande **entière**, des deux côtés ;
3. `create_invoice_from_purchase_order` ne sait exprimer ni sélection de lignes,
   ni quantité à facturer ;
4. là où le Plan a **voulu** plusieurs factures — A-6 —, il a créé l'objet qui
   les porte ;
5. **aucune règle documentaire ne parle d'acompte fournisseur** : Module 07,
   Règles finance §8, Règles fournisseurs §2 et Workflow 08 ont été relus.

**Ce que l'architecture impose** : avec deux factures sur une commande,
`INVOICED` deviendrait ambigu, et l'annulation de l'une ne saurait pas si la
commande redevient « passée ».

🟥 **CE QUI N'EST PAS EMPÊCHÉ POUR AUTANT.** Un fournisseur qui facture une même
commande en deux fois **n'est pas bloqué** : la seconde facture s'enregistre
comme toute facture reçue — chaîne du LOT 5, inchangée. **Éprouvé en
production.** Seul le **lien structurel** est unique ; aucune dette ne disparaît.

> 🟥 **QUESTION POSÉE À LA DIRECTION.** ADIKOM reçoit-elle, en pratique,
> **plusieurs factures pour une même commande fournisseur** — acompte puis solde ?
>
> **Option A** — conserver la règle actuelle. Le complément s'enregistre sans
> commande d'origine. **Aucun développement.**
>
> **Option B** — rattacher plusieurs factures à une commande. Il faudrait un
> objet « tranche de commande », sur le modèle de `rental_billing_periods`, et
> un état de facturation partielle. Extension **additive**.
>
> **Aucune option n'a été choisie d'office** : la règle appliquée est celle que
> l'architecture documentée impose aujourd'hui. **Rien n'est bloqué entre-temps.**

---

# 13. 🟥 Confidentialité — la preuve, autrement

Le LOT 24 a établi qu'un **balayage d'octets** d'un PDF **ne prouve rien**.

| # | Barrière | Éprouvée par |
| :-: | --- | --- |
| 1 | **RLS** — un profil sans capacité d'achat n'obtient **aucune ligne** | Appel PostgREST direct : `0 ligne`, **sans erreur** |
| 2 | **Fonctions** — `purchase_quote_total` rend `0` à qui ne lit pas les lignes | Appel direct |
| 3 | **Écran** — la route est refusée | `307` |
| 4 | **Documents** — les trois modes refusés, chacun sous **sa** capacité | `403` × 6 pour le lecteur, `403` × 2 pour le profil sans achat |
| 5 | **Exports** — jamais plus permissifs que l'écran | `403` × 4 ; `200` + classeur réel pour le porteur |
| 6 | **Journal** — l'avant/après exige la capacité de **son** menu | `audit_detail_permission` |
| 7 | **Différentiel** — le document d'un profil qui **lit réellement** le coût de référence est identique, **octet pour octet** | 54 133 et 54 473 octets, horodatage neutralisé |
| 8 | **Charge utile** — le HTML rendu ne porte aucun terme du domaine du coût | Balayage du HTML servi |
| 9 | **Anti-vacuité** — un profil autorisé lit **réellement** ces montants | Sans lui, les huit précédentes ne prouveraient rien |

## 13.1 🟥 Le document destiné au fournisseur n'est pas une fuite

| Pièce | Destination | Ce qu'elle porte |
| --- | --- | --- |
| **Devis fournisseur** | **interne** | L'offre reçue, telle qu'enregistrée |
| **Bon de commande** | **le fournisseur** | Le prix convenu **avec lui** |

Un bon de commande **doit** dire le prix convenu : c'est ce que le fournisseur
lit pour l'honorer. **Ce qui n'y a jamais sa place, c'est le coût de RÉFÉRENCE
du catalogue** — il lui apprendrait ce qu'ADIKOM paie ailleurs.

## 13.2 🟥 Un défaut trouvé par la recette, et corrigé

**Ce que la recette a trouvé.** Sur un profil ne détenant que
`commerce.purchase_quotes.view`, la fiche de l'offre convertie **disait**, comme
prévu, que la référence de la commande ne lui était pas communiquée — et
**l'affichait trois lignes plus bas**, dans le champ « Motif du dernier
changement » : `convert_purchase_quote_to_order` y écrivait
« Commande CDE-F-2026-000002 ».

`status_reason` appartient au **devis** : il s'ouvre par
`commerce.purchase_quotes.view`, seule. **L'écran disait vrai et faux dans la
même page.**

**Le principe, écrit une fois pour toutes (migration 104)** :

> Un texte écrit **par le système** sur un document du menu A ne porte pas la
> **référence** d'un document du menu B. Le **fait** se dit ; la référence se
> demande à la capacité qui la garde.

Quatre écritures corrigées : la conversion, l'annulation de commande,
l'annulation de facture, et les observations de la facture. **Le lien structurel
demeure** — `purchase_quote_id`, `purchase_order_id` — et porte la traçabilité
sous la capacité qui l'ouvre. Rien n'est perdu pour qui a le droit de lire.

🟦 **Le même écart existe dans le commerce CLIENT** (`convert_sales_quote_to_order`,
`set_sales_order_status`, `cancel_customer_invoice` écrivent « Commande
CDE-C-… » et « Facture FAC-C-… »). **Il n'a pas été corrigé** : le cadrage du
LOT 26 interdit de modifier les devis et commandes clients. Il est nommé en
§18 comme dette, pour le lot qui touchera ce module.

---

# 14. Recettes

## 14.1 Ce que chaque étage éprouve

| Étage | Fichier | Ce qu'il tient seul |
| --- | --- | --- |
| **Unitaire** | `src/features/purchasing/constants.test.ts` | Les branches d'un calcul, la forme des transitions, et **que le vocabulaire de l'achat n'est pas celui de la vente** |
| **SQL** | `supabase/tests/purchasing.sql` | Ce que la base tient **sans l'application** — 28 sections |
| **Production** | `scripts/verify-purchasing.mjs` | Ce qui n'existe qu'en production : vraies sessions, PostgREST, PDF, classeurs, navigateur |

## 14.2 Défauts découverts pendant la recette

| # | Défaut | Nature | Correction |
| :-: | --- | --- | --- |
| 1 | `service_variants.variant_no` n'existe pas ; la variante par défaut vient d'un déclencheur | **Recette** | Recette SQL corrigée avant première exécution complète |
| 2 | `payment_method` porte `BANK_TRANSFER`, non `TRANSFER` | **Recette** | Valeur corrigée ; 5 contrôles en cascade rétablis |
| 3 | 🟥 **La référence de la commande fuyait par le motif du devis** | **Produit** | **Migration 104** (§13.2) |

**Le défaut n° 3 est le seul défaut de produit du lot**, et il a été trouvé par
un contrôle négatif que la recette portait pour cela — non par hasard.

---

# 15. Migrations

| # | Fichier | Contenu |
| :-: | --- | --- |
| **101** | `…_commerce_fournisseur_devis_et_commandes.sql` | 4 tables, 5 couches, RLS, journal, **16 capacités**, numérotation `DEV-F` / `CDE-F` |
| **102** | `…_facturer_une_commande_fournisseur.sql` | 5 colonnes, contrainte de cohérence, index d'unicité, cohérence commande/fournisseur, 4 fonctions étendues, l'orchestrateur |
| **103** | `…_perimetre_de_sauvegarde_du_commerce_fournisseur.sql` | `backup_scope()` **58 → 62** |
| **104** | `…_un_motif_ne_franchit_pas_la_frontiere_d_un_menu.sql` | Correction du défaut n° 3 |

**Chaque fonction réécrite l'a été depuis sa DERNIÈRE VERSION ACTIVE**, et
chaque migration **vérifie** que les acquis des lots antérieurs sont intacts :
le refus de déclarer une facture payée (LOT 6), les deux index d'unicité de la
facturation de location (LOT 23), les correspondances du journal (LOTS 20 à 25).

---

# 16. Sauvegarde — 58 → 62 tables

Les quatre tables s'insèrent **après le commerce client** et **avant le cycle
d'exploitation**. L'ordre est vérifié **paire par paire** — 37 paires — et non
par un décompte : une liste fautive peut porter le bon nombre de tables.

`backup_columns` rend bien **le prix de l'offre** et **la référence du
fournisseur** : sans eux, le montant négocié serait perdu à la restauration, et
**le catalogue n'en garde aucune trace** — c'est tout l'objet de P-5.

---

# 17. Démonstration

Le jeu DEMO porte désormais un scénario d'achat complet, **idempotent** :

```
FOURNISSEUR DEMO 01
   └─ DEV-F-2026-000001  (réf. fournisseur PRO-2026-0147)
         3 × 52 000 catalogue  +  2 × 7 500 ligne libre (A-13)
      ─ reçu ─ retenu ─▶ CDE-F-2026-000001 ─ passée ─ réceptionnée
                              ─▶ FAC-F-2026-000226  (réf. FA-2026-0912, validée)
```

🟥 **Il montre l'écart qui fait le lot** : le catalogue DEMO porte un coût de
référence de **45 000 KMF** pour « SERVICE DEMO 03 » ; ce fournisseur en demande
**52 000**, et c'est 52 000 qui est enregistré.

Le second passage crée **0 élément** : le défaut du `continue` relevé au LOT 24
n'est pas reproduit — l'étape nouvelle a bien été atteinte sur un jeu DEMO déjà
en place (3 créés, 108 déjà présents).

---

# 18. Points ouverts et dettes

| # | Point | Nature |
| :-: | --- | --- |
| 1 | **Plusieurs factures pour une même commande** | 🟥 **Question posée** (§12). Rien n'est bloqué |
| 2 | **P-5** — prix d'achat par fournisseur au catalogue | 🟥 **Ouvert et intact**. Le lot fonctionne sans |
| 3 | **Remises consenties par un fournisseur** | 🟦 Non modélisées. DEC-051 porte sur les remises **clients** |
| 4 | **Motifs du commerce CLIENT** | 🟦 **Dette nommée** (§13.2) : le même écart y subsiste, non corrigé par consigne |
| 5 | **Traçabilité ligne à ligne de la facture** | 🟦 Conforme au Plan 02 §9.2 ; une ligne ajoutée après coup n'est pas distinguable |
| 6 | **Référence externe d'une commande directe** | 🟦 Non prévue ; consignable en observations |
| 7 | **Convention définitive des références** | 🟦 DEC-023 §5 — `DEV-F` / `CDE-F` provisoires |
| 8 | **Produits, stock, réception physique** | 🟦 Non développés, et le modèle les accueillera |
| 9 | **A-7 · DEC-008 · P-2 · Plan 02 §5.7** | 🟥 **Intouchés** |

---

# 19. Ce que le lot n'a PAS fait, et l'a écrit

- 🟥 **Aucune table de facture fournisseur parallèle.**
- 🟥 **Aucun mécanisme de paiement** : la trésorerie ne bouge qu'au règlement.
- 🟥 **Aucune modification de `supplier_vehicle_rates`** (LOT 21) : le tarif
  fournisseur d'un **véhicule** et l'achat d'un **service** sont deux actes
  différents, qui peuvent concerner le même fournisseur sans se confondre.
- 🟥 **Aucune modification du commerce CLIENT** : ni table, ni fonction, ni
  capacité. **DEC-051 n'a pas été implémentée.**
- 🟥 **Aucun produit, aucun stock, aucun entrepôt, aucune réception physique.**
- 🟥 **Aucune fonction de marge**, aucune fonction `SECURITY DEFINER`.
- 🟥 **`service_variant_costs` n'a reçu aucune colonne.**

---

**ADIKOM PILOT — Rapport 18**
**LOT 26 · DEC-052 · Commerce fournisseur : devis et commandes fournisseurs**
