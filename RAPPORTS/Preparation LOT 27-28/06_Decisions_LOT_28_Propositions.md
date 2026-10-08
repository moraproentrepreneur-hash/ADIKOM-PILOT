# Décisions du LOT 28 — propositions à valider

**Point de vente : ventes et encaissement**

| | |
| --- | --- |
| Date | 8 octobre 2026 |
| Nature | **Propositions.** Aucune décision n'est prise par ce document. Aucun code, aucune migration |
| Base de lecture | branche `lot-28-point-de-vente` = LOT 27 provisoire `09d9ab6` (non validé sur Supabase) |
| Normatif | `CLAUDE.md` §16, §19 bis, §47 bis, §57, §58 · Plan 02 §3.4, §3.5, §7.5, §9.2, §10.2, §16.2 · DEC-024 · DEC-051 |
| Code relu | `fn_treasury_entry_source` (dernière version : `20260908000200`) · `treasury_entries_single_origin` (`20260906000100`) · `record_customer_payment`, `customer_invoice_paid`, `fn_customer_invoice_no_cancel_when_paid` (`20260902000100`) · `cancel_customer_payment` (`20260902000200`) · agrégats de `customer_payments` (`20260903000100`, `20260904000200`, `20260908000100`) · LOT 27 (`20261008000100` à `0400`) |

> Les compteurs cités (111 migrations, 238 capacités, 65 tables) sont ceux du LOT 27
> **provisoire**. Ils ne seront acquis qu'après la validation locale du LOT 27.

---

# 1. Synthèse

| Réf. | Question | Proposition | Bloque le schéma ? |
| :-: | --- | --- | :-: |
| **C-2** | Origine unique d'un encaissement PDV facturé | **Une seule origine de trésorerie : le paiement PDV.** La facture est soldée par un **règlement adossé, sans écriture** (§2) | 🟥 **oui — à valider en premier** |
| **T-2** | Granularité de la 5ᵉ origine | `treasury_entries.pos_payment_id` (une écriture par paiement), au lieu de `pos_sale_id` (§2.3) | 🟥 oui (technique) |
| **D-3** | *(nouvelle)* Sur quel compte entre un paiement non-espèces ? | Espèces → compte de la caisse, imposé. Autres modes → compte **actif** choisi, de type `BANK` (§5) | 🟥 oui |
| **P-4** | Paiement différé sans client identifié ? | **Refusé** : la vente non soldée exige un client existant (§3) | 🟥 oui |
| **D-1** | Remise PDV selon DEC-051 ? | **Oui** : montant fixe KMF, ligne et globale, sans plafond, sous `pos.sales.discount` (§4) | 🟥 oui |
| **D-2** | Mvola, Holo, Wakati aussi pour les règlements clients et fournisseurs ? | **Oui** — l'énumération est commune ; on n'en crée pas une seconde (§5) | 🟧 oui |
| **B-10** | Annuler une vente d'une session close ? | **Oui**, motif obligatoire, écart recalculé et affiché. **Jamais** une vente facturée (§6) | 🟧 oui |
| **B-11** | Remboursement au comptoir ? | **Hors périmètre** : une vente erronée s'annule, elle ne se rembourse pas (§6) | non |
| **C-28** | Les 8 capacités du Plan 02 §10.2 | **Validées telles quelles → 246** (§7) | 🟧 oui |
| **S-1** | Correctif « née par sa fonction » sur `customer_invoices` / `customer_payments` | **Oui**, en **premières migrations distinctes** de la branche LOT 28 (§8) | conseillé — devenu utile à C-2 |

🟥 = la réponse change le schéma. 🟧 = une recommandation écrite, une confirmation d'un mot suffit.

---

# 2. 🟥 C-2 — l'origine unique d'un encaissement PDV

## 2.1 La contradiction, telle qu'elle se lit dans le code

- Plan 02 §3.5 : `customer_payments.pos_sale_id` **ou** `pos_sales.customer_invoice_id`, « l'un des
  deux, jamais les deux ».
- Plan 02 §9.2 : **à la fois** `customer_invoices.pos_sale_id`, `customer_payments.pos_sale_id` et
  `treasury_entries.pos_sale_id`.
- `record_customer_payment` écrit **toujours** une écriture `CUSTOMER_PAYMENT`. Le reçu d'une
  facture se **calcule** de `customer_invoice_paid` = Σ `customer_payments` validés.

Une facture « soldée par le paiement PDV déjà enregistré » exige donc **soit** un règlement
**sans** écriture propre (option A), **soit** un calcul de solde qui lit aussi les ventes
(option B).

## 2.2 Les deux options, mesurées

| | **A — règlement adossé** (recommandée) | **B — solde dérivé de la vente** |
| --- | --- | --- |
| Principe | La facture est soldée par un `customer_payment` portant `pos_payment_id`, **sans écriture** | Aucun règlement : `customer_invoice_paid` ajoute Σ encaissé de la vente liée |
| Fonctions partagées réécrites | **Aucune.** `customer_invoice_paid` intact | `customer_invoice_paid`, **lue par 6 fonctions** (notifications, statistiques, tableau de bord, projets, calendrier, garde d'annulation) |
| Visibilité | Inchangée : `billing.customer_payments.view`, comme aujourd'hui | Un lecteur sans `pos.sales.view` voit la facture **impayée** : fausse relance « en retard », et **la garde `no_cancel_when_paid` laisse annuler une facture encaissée** |
| Indicateurs « encaissé clients » | Comptent le règlement adossé (à la date de la vente) | Ne le comptent pas : une facture PAYÉE sans aucun encaissement client |
| Nouveau code | une fonction d'adossement, une garde dans `fn_treasury_entry_source` | réécriture d'une fonction transversale + gardes de visibilité dans la facturation |

**B diffuse une capacité du PDV dans toute la facturation et rouvre une garde financière.
A reste local.** Recommandation : **A**.

## 2.3 Le modèle proposé

**Règle unique : tout franc reçu au comptoir a exactement UNE origine de trésorerie, le paiement
PDV (`POS_SALE`). Une facture liée à une vente ne produit jamais d'écriture pour cet argent.**

| Colonne | Rôle | Garantie |
| --- | --- | --- |
| `treasury_entries.pos_payment_id` | **5ᵉ origine** — la seule écriture de cet argent | `fn_treasury_entry_source` : `kind = 'POS_SALE'`, `direction = 'IN'`, `amount = applied_amount` (**jamais** `tendered`), `account_id` du paiement, vente `VALIDATED` à la création · unique hors annulées |
| `customer_invoices.pos_sale_id` | **lien documentaire** : quelle vente cette facture reprend | unique hors factures annulées → une seule facture par vente |
| `customer_payments.pos_payment_id` | **règlement adossé** : solde la facture **sans** écriture | unique hors règlements annulés · facture et paiement de la **même** vente (contrôle en base) |
| ~~`pos_sales.customer_invoice_id`~~ | **non créée** | — |

**T-2 (technique)** : le Plan 02 §9.2 nommait `treasury_entries.pos_sale_id`. Une vente peut être
réglée en espèces **et** en Mvola, qui n'entrent pas sur le même compte (D-3). Une écriture **par
paiement** garde la règle actuelle « une écriture = une opération = un compte ». Le nom de la
colonne change donc ; le principe du Plan, non.

**Ce qui interdit le double comptage — en base, pas à l'écran :**

1. `treasury_entries_single_origin` étendue à **5** colonnes.
2. `fn_treasury_entry_source` refuse toute écriture `customer_payment_id` dont le règlement porte
   un `pos_payment_id` : un règlement adossé **n'a jamais** d'écriture.
3. Index unique `treasury_entries (pos_payment_id)` hors annulées : une seule écriture par paiement.
4. Le règlement adossé naît **uniquement** par sa fonction (drapeau transactionnel + déclencheur
   `zzz_`, motif du Rapport 20) : un `INSERT` direct ne peut ni l'inventer ni l'éviter.
5. `fn_treasury_entry_source`, `_immutable`, `_consistent` et la policy d'insert **révisées
   ensemble**, chacune reprise **depuis sa dernière version** (mémoire « une policy UPDATE se
   reprend à sa dernière version »).

## 2.4 Les quatre cas — où va chaque franc

| Cas | Trésorerie | Facture | Règlement client |
| --- | --- | --- | --- |
| **1. Vente soldée** — net 60 000, donné 100 000 en espèces | **1 écriture `POS_SALE` de 60 000** sur le compte de la caisse. Monnaie 40 000 : aucune écriture (elle n'est jamais entrée) | aucune | aucun |
| **2. Vente soldée, puis facture sur demande** | **rien de nouveau** — le solde du compte reste **60 000** | créée par les fonctions **existantes**, `pos_sale_id` posé, émise | **un règlement adossé par paiement PDV**, sans écriture → facture **PAYÉE** |
| **3. Vente non soldée avec client** — net 100 000, versé 30 000 | **1 écriture `POS_SALE` de 30 000** | créée **et émise dans la même transaction** que la vente, 100 000 | règlement adossé 30 000 → reste dû **70 000**. Les règlements suivants passent par `record_customer_payment` (écriture `CUSTOMER_PAYMENT`, normale) |
| **4. Annulation d'une vente non facturée** | les écritures `POS_SALE` passent `CANCELLED` (motif « annuler n'est pas recréer ») | — | — |

Annuler une vente **facturée** (cas 2 et 3) : **refusé** au LOT 28 (§6, B-10).

## 2.5 Conséquences techniques à connaître

- **Indicateurs.** Le tableau de bord et les statistiques additionnent `customer_payments` comme
  « encaissé clients ». Un règlement adossé y figurera, **daté du jour de la vente**. Une vente
  **non facturée** n'y figurera pas. Aucun indicateur PDV n'existe aujourd'hui : rien n'est donc
  compté deux fois au LOT 28, mais **tout futur indicateur PDV devra exclure les règlements
  adossés**. À noter au module 12.
- **`cancel_customer_payment`** ne doit pas annuler seul un règlement adossé (il n'a pas
  d'écriture, et rouvrirait une dette déjà payée au comptoir) : refus explicite.
- **Capacités** : la facture sur demande et la vente à crédit **appellent les fonctions de
  facturation existantes**, qui exigent leurs propres capacités (`billing.customer_invoices.create`,
  `.issue`, `billing.customer_payments.create`…). Rien n'est contourné — un caissier sans ces droits
  ne facture pas (DEC-024).
- **Test de référence** (Plan 02 §16.2) : vente 60 000 / donné 100 000 → écriture 60 000 ; facture
  sur demande → facture PAYÉE **et** solde du compte **toujours 60 000** ; une écriture forgée
  `CUSTOMER_PAYMENT` sur le règlement adossé → **refusée**.

**À valider avant toute table du LOT 28.**

---

# 3. 🟥 P-4 — un crédit suppose un débiteur

**Proposition** : la vente **non soldée** (`pos.sales.credit`) **exige un client existant** dans
Tiers. Une vente anonyme se règle intégralement — l'écran **dit pourquoi**, il ne grise pas un bouton.

| Conséquence | Détail |
| --- | --- |
| Base | `check (status <> 'VALIDATED' or paid_in_full or client_id is not null)` — formulation exacte au schéma |
| Création du client | **pas depuis la caisse** au LOT 28 : elle exige `parties.clients.create` et la fiche complète (tarifs préférentiels, `CLAUDE.md` §13). Proposition seulement ; à rouvrir si l'usage le demande |
| Lecture | choisir un client exige `parties.clients.view` |
| Recouvrement | le solde vit dans la facture (cas 3) : relances, échéance, « en retard » existent déjà |

---

# 4. 🟥 D-1 — la remise PDV suit DEC-051

**Proposition** : DEC-051 s'applique au PDV **sans adaptation** — montant fixe en KMF, remise de
ligne et remise globale, toutes deux facultatives, **aucun plafond**, aucun pourcentage.

- Gardes DEC-051 §d en base : `0 ≤ remise de ligne ≤ brut de ligne` ; `0 ≤ remise globale ≤
  sous-total` ; net et total jamais négatifs.
- Toute remise non nulle exige **`pos.sales.discount`**, vérifiée **dans la fonction**, pas à l'écran.
- La remise réduit le net : la vente reste **soldée** (Plan 02 §3.4).
- La facture sur demande passe par la chaîne de facturation client existante. Celle-ci porte les
  réductions comme des **lignes `DISCOUNT`** (`customer_invoice_discount`, Module 07 §24), sans
  rattachement à une ligne précise. **Proposition** : chaque remise PDV non nulle — de ligne ou
  globale — devient une ligne `DISCOUNT` libellée (« Remise sur <service> », « Remise globale »).
  Le total net est identique ; l'attribution reste lisible par le libellé. **Aucune fonction de
  facturation n'est modifiée.** À confirmer avec D-1.

---

# 5. 🟧 D-2 et 🟥 D-3 — les modes de paiement et leur compte

**D-2 — proposition : oui.** `payment_method` est **une seule** énumération, partagée par les
règlements clients, fournisseurs et les paiements PDV. Ajouter `MVOLA`, `HOLO`, `WAKATI` les rend
disponibles partout ; les cacher ailleurs demanderait une seconde énumération ou une liste
filtrée, sans besoin exprimé.

- Migration **isolée** (`alter type … add value` ne s'utilise pas dans sa transaction).
- Côté TS : libellés dans les formulaires de règlement, l'export, le journal.
- Non-régression locale : `supplier_invoices.sql`, `customer_payments.sql`, `verify:customer-payments`.

**D-3 — question nouvelle, révélée par la relecture.** Les comptes financiers ne connaissent que
`BANK` et `CASH`. La caisse est adossée à **un** compte `CASH`. Si un paiement Mvola ou un chèque
entrait sur ce compte, **le solde du compte ne correspondrait plus aux espèces comptées** et l'écart
de session mentirait.

**Proposition** :

| Mode | Compte mouvementé |
| --- | --- |
| `CASH` | **le compte de la caisse**, imposé par la base |
| `CHEQUE`, `MVOLA`, `HOLO`, `WAKATI` | un compte **actif de type `BANK`** choisi à l'encaissement (ex. « Mvola ADIKOM », déclaré dans Banques & Caisses) |

- **Aucun nouveau type de compte** (`MOBILE`) : il exigerait sa propre décision.
- Le montant théorique de la session (`pos_session_expected`) ne compte **que les espèces**.
- Monnaie : seulement en espèces (`check (method = 'CASH' or applied = tendered)`).

🟥 **Question à la Direction** : « Les encaissements Mvola, Holo, Wakati et chèque au comptoir
entrent-ils sur des comptes bancaires déclarés (un par opérateur), et non dans la caisse ? »

---

# 6. 🟧 B-10 et B-11 — annuler, pas rembourser

**B-10 — proposition** : l'annulation d'une vente d'une session **close** est **possible**, sous
`pos.sales.cancel`, avec :

- motif **obligatoire**, journalisé ;
- avertissement à l'écran : l'écart de la session close **change** (il est dérivé, jamais stocké) ;
- écritures `POS_SALE` passées `CANCELLED`, rien d'effacé ;
- **refus si la vente a une facture non annulée** : la facture a été remise au client, et aucun avoir
  n'existe. *(Option la plus restrictive, retenue faute d'avoir.)*

**B-11 — proposition** : le remboursement est **hors périmètre**. Une annulation corrige une **erreur
de saisie** ; elle ne décrit pas de l'argent rendu. Si de l'argent est rendu physiquement, il sort de
la caisse **sans écriture** : l'écart du jour le montrera. Un vrai remboursement exigerait sa propre
décision (écriture `OUT`, capacité, document).

---

# 7. 🟧 C-28 — les huit capacités

**Proposition : les 8 du Plan 02 §10.2, telles quelles → 238 + 8 = 246.**

`pos.sales.view` · `.create` · **`.discount`** ✓ · **`.credit`** ✓ · `.cancel` ✓ · `.download` ✓ ·
`.print` ✓ · `.export` ✓.

- **Aucune** capacité « facture sur demande » : elle réemploie `billing.customer_invoices.create` /
  `.issue` (§2.5). Si la Direction veut l'attribuer séparément du reste de la facturation, c'est
  une **9ᵉ capacité** à décider maintenant.
- `catalog.services.cost.view` garde `commercial_line_costs` (DEC-049 §e) : **existante**, rien à créer.
- Total **provisoire** : 246 suppose 238 validé au LOT 27.

---

# 8. S-1 — la garde « née par sa fonction » avant le LOT 28

**Proposition : oui**, sur `customer_invoices` **et** `customer_payments`, en **premières
migrations** de la branche LOT 28, **commits distincts**, rapportées à part dans le Rapport 22.

Pourquoi maintenant, et pas après :

- C-2 crée un **règlement adossé** qui doit naître **uniquement** par sa fonction. La garde sur
  `customer_payments` en est le socle : la poser **avant** l'orchestrateur évite de l'écrire deux fois.
- L'audit statique (préparation §7) a déjà confirmé le défaut sur `customer_invoices`.
- `sales_orders` et `purchase_orders` : **hors** S-1, selon arbitrage ultérieur.

Risque : ces migrations touchent la **facturation commune** → non-régression étendue en local
(`customer_invoices.sql`, `customer_payments.sql`, `commerce.sql`, `verify:customer-payments`).

---

# 9. Ce qui reste à rendre, dans l'ordre

1. **C-2 + T-2** — sans eux, aucune table.
2. **D-3**, **P-4**, **D-1** — ils fixent les contraintes des tables.
3. **D-2**, **B-10**, **C-28**, **S-1** — une confirmation suffit.
4. B-11 — confirmation de l'exclusion.

Une fois rendues : DEC-055 (brouillon) les consigne, et `03_Prompt_Cloud_LOT_28.md` est complété.

---

**PROPOSITIONS — AUCUNE DÉCISION PRISE · AUCUNE MIGRATION · BASE NON MODIFIÉE**
