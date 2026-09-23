# Rapport 17 — Commerce client : devis et commandes

## LOT 25 · Module 11 · DEC-049

**Date :** 23 septembre 2026
**Entreprise :** ADIKOM Technology & Travel
**Projet :** ADIKOM PILOT
**Sources :** Plan 02 §7.1, §9.1–9.3, §9.5, §10.2, §13.2 · Plan 01 §15 · Décisions Direction A-10, A-13, A-14 · DEC-006, DEC-010, DEC-017, DEC-023, DEC-024, DEC-043, DEC-046, DEC-049

---

# 1. Objectif

Livrer la **couche commerciale** d'ADIKOM PILOT — devis clients et commandes
clients — et l'**articuler** avec la facturation déjà en production, sans en
réécrire aucune brique.

```
CATALOGUE DE SERVICES (LOT 20)
        ▼
   DEVIS CLIENT ──accepté──▶ COMMANDE CLIENT ──confirmée──▶ FACTURE CLIENT (LOT 7)
   (conservé)                (liée au devis)                        ▼
                                                        RÈGLEMENT CLIENT (LOT 8)
                                                                    ▼
                                                           TRÉSORERIE (LOT 6)
```

Le lot devait démontrer trois choses, et il les démontre :

1. **Le prix accepté par le client ne se réécrit jamais** — ni par une hausse du
   catalogue, ni par la conversion, ni par la facturation.
2. **Aucun système parallèle** — une facture née d'une commande est une
   `customer_invoices` ordinaire, et rien d'autre.
3. **Aucun coût, aucune marge ne sort par un document commercial**, et la preuve
   n'est pas un balayage d'octets.

---

# 2. État initial

| | |
| --- | --- |
| Branche | `main` |
| SHA de départ | `b6d47e9` |
| Arbre de travail | propre |
| Migrations appliquées | 96, dernière `20260922000300` |
| Catalogue | **197** capacités |
| Périmètre de sauvegarde | **54** tables |
| Tables `public` | 65 |
| Production | `https://adikom-pilot.vercel.app` · READY |

---

# 3. Sauvegarde préalable — étape bloquante, honorée

`npm run backup:snapshot -- LOT25`, **avant la première migration** :

```
[OK] Le fichier existe et porte des octets           149 Kio
[OK] Format reconnu par admin_restore_backup         adikom-pilot.sauvegarde
[OK] Version du format présente                      v1
[OK] Horodatage présent                              2026-09-23T01:05:07+00:00
[OK] La configuration voyage avec les données        16 règles de numérotation
[OK] Les 54 tables du périmètre figurent dans le fichier
[OK] Chaque table porte exactement ses lignes de la base   192 lignes
[OK] Le total annoncé par le fichier est celui de la base  192 / 192
```

Fichier conservé **hors du dépôt** :
`SAUVEGARDES_ADIKOM/adikom-pilot-LOT25-2026-09-23T01-05-10.json`.

Le fichier a été **relu** et ses compteurs **comparés table par table** à la
base : un fichier présent n'est pas une sauvegarde exploitable.

---

# 4. Décisions appliquées

| Réf. | Décision | Application |
| :-: | --- | --- |
| **A-13** | Lignes libres autorisées | `service_id` et `service_variant_id` nullables, ensemble ou pas du tout. Aucun service « Divers » |
| **A-14** | Permissions indépendantes par action | 16 capacités, deux menus étanches, huit actions chacun |
| **A-10** | Paiement partiel | **Non reconstruit.** La facture entre dans le module de règlements existant |
| **B-6** | Aucune réception documentée | `DELIVERED` est un statut, jamais un bon de livraison |
| **B-7** | Un devis expiré ne change pas de statut | Péremption **dérivée** de `valid_until`, jamais écrite |
| **B-14** | Quantité entière | `integer` avec `check (> 0)` |
| **DEC-006** | Deux entités, deux jeux de statuts | Le devis n'est pas une commande à un statut près |
| **DEC-010** | Montants entiers en KMF | `bigint`, aucun flottant nulle part |
| **DEC-023** | Convention des références | `DEV-C` / `CDE-C`, format **provisoire** comme `FAC-C` |
| **DEC-024** | Capacités distinctes | `download` ≠ `print` ≠ `view`, éprouvé par l'écran et par appel direct |

## 4.1 Deux écarts assumés par rapport au **Plan 01**, et pourquoi

| Le Plan 01 prévoyait | Ce qui est livré | Pourquoi |
| --- | --- | --- |
| `unit_cost` sur la ligne commerciale | **aucune colonne de coût** | Le **Plan 02 §9.3** l'en retire : « le coût copié doit sortir de la ligne » ; le §13.2 le renvoie à `commercial_line_costs`, **LOT 28** |
| `discount_amount` par ligne, `sales_quote_discount()` | **aucune remise** | Le Plan 02 ne le reprend pas et **ne crée aucune capacité de remise** pour le LOT 25 — alors qu'il en crée une, nommément, pour le PDV |
| `sales_quote_margin()` | **absente** | Sans coût, elle rendrait `NULL` à perpétuité. Une fonction qui ne distingue rien ne s'écrit pas |
| `subtotal` · `discount` · `total` | **`sales_quote_total()` seule** | Sans remise, les trois rendraient le même nombre sous trois noms |

---

# 5. Architecture

## 5.1 Schéma réel — quatre tables créées

| Table | Colonnes | Rôle |
| --- | :-: | --- |
| `sales_quotes` | 26 | Le devis : n°, client, date, validité, statut, traces d'actes |
| `sales_quote_lines` | 12 | Ses lignes : service et variante **facultatifs**, désignation, quantité, prix — **tous figés** |
| `sales_orders` | 25 | La commande : n°, client, **devis d'origine facultatif**, date, livraison attendue, statut |
| `sales_order_lines` | 13 | Ses lignes, plus `source_quote_line_id` |

**Périmètre `public` : 65 → 69 tables.**

## 5.2 Colonnes ajoutées à des tables existantes — Plan 02 §9.2

| Table | Colonne | Nullable |
| --- | --- | :-: |
| `customer_invoices` | `sales_order_id` | ✅ |
| `customer_invoice_lines` | `service_id` | ✅ |
| `customer_invoice_lines` | `service_variant_id` | ✅ |
| `customer_invoice_lines` | `source_order_line_id` | ✅ |

**Aucune donnée existante n'est modifiée.** Les factures de location et de
services déjà en base reçoivent `NULL` partout.

🟥 **Aucune colonne de coût n'a été ajoutée**, et la migration 098 refuserait de
s'appliquer si `customer_invoice_lines` en portait une.

## 5.3 Énumérations créées

```
commercial_document_status : DRAFT · SENT · ACCEPTED · REFUSED · CONVERTED · CANCELLED
order_status               : DRAFT · CONFIRMED · DELIVERED · INVOICED · CANCELLED
```

Elles sont **créées**, non étendues : l'avertissement du Plan 02 §9.5 sur
`alter type … add value` ne concerne pas ce lot.

**Aucun `EXPIRED`** — B-7, §8.1.

## 5.4 Contraintes structurantes

| Objet | Rôle |
| --- | --- |
| `sales_quote_lines_catalog_pair`, `sales_order_lines_catalog_pair` | Service et variante vont **ensemble ou pas du tout** (A-13) |
| `sales_quote_lines_variant_belongs`, `sales_order_lines_variant_belongs`, `customer_invoice_lines_variant_belongs` | **Clé étrangère composite** : la variante appartient bien à son service |
| `service_variants_id_service_idx` | L'index unique qui porte les trois précédentes |
| `sales_orders_one_per_quote_idx` | **Un devis ne produit pas deux commandes** (partiel, hors annulées) |
| `customer_invoices_one_per_order_idx` | **Une commande, au plus une facture non annulée** (partiel, hors annulées) |
| `check (quantity > 0)`, `check (unit_price > 0)` | Entiers strictement positifs (DEC-010, B-14) |
| `sales_quotes_validity`, `sales_orders_expected` | Une date de fin ne précède pas sa date de début |

### 🟥 Pourquoi une clé étrangère composite, et non un déclencheur

Un déclencheur qui vérifierait « la variante appartient-elle à ce service ? »
lirait `service_variants` **à travers RLS**. Pour un appelant sans
`catalog.services.view`, il ne verrait **aucune ligne** et conclurait
« introuvable » — ou, écrit à l'envers, laisserait passer.

> « Une garde qui compte doit compter la vérité. » (Plan 02 §8.3 n° 5)

Une clé étrangère composite s'évalue sous le propriétaire de la table : elle ne
dépend d'aucune capacité, ne coûte rien par ligne, et ne peut pas être écrite à
l'envers.

---

# 6. Numérotation

| Objet | Règle | Format |
| --- | --- | --- |
| Devis client | `sales_quote` | `DEV-C-2026-000001` |
| Commande client | `sales_order` | `CDE-C-2026-000001` |

**Aucun second numéroteur.** Les deux règles rejoignent `numbering_rules` et
`next_number` les sert comme elle sert `FAC-C` — en **verrouillant sa règle**
(`for update`), de sorte que deux saisies simultanées ne produisent jamais le
même numéro.

**Format provisoire**, conformément au Plan 01 §15.5 : DEC-023 §3 réserve la
convention définitive (séries `BIS-DVCL-A0001`) à une extension de `next_number`
explicitement reportée, et son §5 exige que chaque code de type soit **confirmé
avant première émission réelle**.

---

# 7. Le catalogue de services, consommé

| Acte | Ce qui se passe |
| --- | --- |
| **Ajout d'une ligne de catalogue** | `resolve_service_price(variante, date du document)` est interrogé — **le seul endroit du lot** |
| **Immédiatement après** | Sa réponse est **copiée** dans `unit_price` ; la désignation dans `label` |
| **Sans prix en vigueur** | La ligne est **refusée**, avec la date en clair. Un devis ne devine pas un montant |
| **Prix transmis avec une variante** | **Refusé** : le prix d'une ligne de catalogue vient du catalogue |

Seules les variantes **actives** de services **actifs** destinés à la **vente**
(`SALE` ou `BOTH`) sont proposées. Une variante sans prix en vigueur est
**proposée quand même, marquée comme telle** — l'écran dit pourquoi elle ne peut
pas être ajoutée, au lieu de la faire disparaître sans explication (DEC-017).

## 7.1 Lignes de catalogue et lignes libres — 🟩 A-13

| | Ligne de catalogue | Ligne libre |
| --- | --- | --- |
| Service, variante | obligatoires | **aucun** |
| Désignation | **copiée**, ajustable | **saisie** |
| Prix unitaire | **résolu**, non saisissable | **saisi** |
| Quantité | saisie, entière | saisie, entière |

La nature d'une ligne n'est **pas une colonne** : elle se lit de la présence du
service. Une colonne de plus aurait pu contredire la donnée.

**Aucun service « Divers » n'est créé** pour contourner le modèle.

## 7.2 Ce qui est photographié

| Donnée | Copiée ? | Raison |
| --- | :-: | --- |
| Prix unitaire | ✅ | Le montant proposé engage |
| Désignation | ✅ | Un service **renommé** ne rend pas faux un devis d'hier |
| Quantité | ✅ | Propre au document |
| Service, variante | référence | Traçabilité, non valorisation |
| **Client** | ❌ | Doctrine existante (§7.3) |
| **Coût d'achat** | ❌ | §12 |

## 7.3 Le client n'est pas photographié

Les factures clients (LOT 7) ne recopient ni le nom, ni l'adresse du client :
elles désignent la fiche et la lisent à l'affichage. **Le commerce client fait
exactement pareil.**

**Conséquence assumée, écrite** : un changement d'adresse modifie l'adresse
imprimée sur un document réédité. C'est la doctrine en place pour toutes les
pièces du SaaS. Introduire un snapshot ici, et là seulement, aurait créé **deux
règles pour la même question**.

---

# 8. Cycles de vie

## 8.1 Devis

```
BROUILLON ──émettre──▶ ÉMIS ──accepter──▶ ACCEPTÉ ──convertir──▶ CONVERTI
    │                    │                   │                      │
    │                    └──refuser──▶ REFUSÉ │       (annulation de │
    │                    │                   │        la commande)  │
    │                    │                   ◀──────────────────────┘
    └────────────────────┴───────────────────┴──annuler──▶ ANNULÉ
```

| Transition | Capacité exigée |
| --- | --- |
| → ÉMIS, → ACCEPTÉ, → REFUSÉ | `commerce.sales_quotes.validate` |
| → ANNULÉ | `commerce.sales_quotes.cancel` |
| → CONVERTI | `commerce.sales_orders.create` |
| CONVERTI → ACCEPTÉ | `commerce.sales_orders.cancel` |

**Pourquoi le refus relève de `validate`** : enregistrer la réponse du client —
favorable ou non — est le **même geste**, par la même personne, sur le même
écran. Annuler est un acte d'ADIKOM. **Un devis refusé n'est pas un devis
annulé.**

**Aucun statut `EXPIRED`.** 🟩 B-7 : le projet n'a aucun ordonnanceur, et un
statut écrit sans surveillance mentirait entre deux passages. La péremption se
**calcule** de `valid_until` et du jour comorien, et ne concerne qu'un devis
**encore en attente de réponse**.

**Aucune durée de validité par défaut.** Aucune politique commerciale n'est
écrite chez ADIKOM ; en proposer une reviendrait à la décider (`CLAUDE.md` §55).

## 8.2 Commande

```
BROUILLON ──confirmer──▶ CONFIRMÉE ──livrer──▶ LIVRÉE
                             │                    │
                             └─────facturer───────┴──▶ FACTURÉE
                                                          │
   (annulation de la facture)  ◀───────────────────────────┘

BROUILLON · CONFIRMÉE · LIVRÉE ──annuler──▶ ANNULÉE
```

| Transition | Capacité exigée |
| --- | --- |
| → CONFIRMÉE, → LIVRÉE | `commerce.sales_orders.validate` |
| → ANNULÉE | `commerce.sales_orders.cancel` |
| → FACTURÉE | `billing.customer_invoices.create` |
| FACTURÉE → CONFIRMÉE | `billing.customer_invoices.cancel` |

**La livraison n'est pas un passage obligé.** Le Plan 01 §15.5 facture depuis
`CONFIRMED` ; `DELIVERED` est un **constat** (B-6).

## 8.3 Immutabilité

| Document | Ce qui se fige, et quand |
| --- | --- |
| Devis | Dès qu'il **quitte le brouillon** : client, date, validité, n°, devise, **conditions** — et **toutes ses lignes**, y compris leur retrait |
| Commande | Dès qu'elle est **confirmée** : client, devis d'origine, date, n°, devise, **conditions** — et toutes ses lignes |
| Facture | Règle du LOT 7, inchangée |

🟥 **L'archivage d'une ligne est inclus dans le gel.** Retirer une ligne d'un
devis émis changerait son total aussi sûrement qu'en modifier le prix.

🟥 **Les CONDITIONS aussi** — migration 100, §20.5. Elles sont imprimées sur la
pièce remise au client et font partie de ce qu'il a accepté.

Les **observations** restent annotables après émission, comme celles d'une
facture depuis le LOT 7 — mais **annoter exige la capacité de modifier**, au
lieu de suivre incidemment celle d'un voisin.

---

# 9. La conversion devis → commande

🟥 **Le devis n'est pas transformé.** Aucun enregistrement ne change de nature :
une commande **naît**, le devis passe à « converti » et **reste consultable** tel
qu'il a été remis au client.

```
DEV-C-2026-000001   (reste DEV-C, statut « converti »)
        │
        ▼
CDE-C-2026-000001   (acte nouveau, sales_quote_id → le devis)
```

🟥 **Le catalogue n'est pas réinterrogé.** Chaque ligne active est **recopiée** —
désignation, quantité, prix, service, variante — et porte `source_quote_line_id`.

**Capacités exigées** — la symétrie de `create_invoice_from_sales_order`
(Plan 01 §15.5) : `commerce.sales_orders.create` + `.view` +
`commerce.sales_quotes.view` + `parties.clients.view`. Elle n'exige **pas**
`commerce.sales_quotes.validate` : le passage du devis à « converti » est la
**conséquence** de la commande, comme l'émission d'une facture fait passer la
location à « Facturée » sans exiger `rental.rentals.update`.

**Un devis ne produit pas deux commandes**, et l'index partiel le tient aussi
pour un `INSERT` direct — donc pour deux clics simultanés.

---

# 10. La facturation d'une commande

## 10.1 Un orchestrateur, jamais un second système

`create_invoice_from_sales_order` **n'écrit elle-même aucune ligne** dans les
tables de facturation :

```
create_invoice_from_sales_order(commande, date, échéance)
        ├─▶ create_customer_invoice(…)       ← EXISTANTE, non dupliquée
        └─▶ add_customer_invoice_line(…)     ← EXISTANTE, une par ligne active
                 kind = 'SERVICE'
                 label · quantité · prix     ← COPIÉS de la commande
                 service · variante · ligne d'origine
```

**La facture naît en BROUILLON.** L'émettre reste un acte distinct, sous
`billing.customer_invoices.issue`.

**Capacités exigées** : `commerce.sales_orders.view` +
`billing.customer_invoices.create` + `.view` + `parties.clients.view`. **Pas
`.issue`.**

## 10.2 Ce qu'une facture issue d'une commande est

Une `customer_invoices` **ordinaire** : même numérotation `FAC-C`, même écran,
mêmes filtres, même émission, mêmes **règlements — paiement partiel compris
(🟩 A-10)** —, mêmes écritures de trésorerie, même place dans le pilotage.

**Éprouvé en production** : la facture apparaît dans le module Factures clients,
au montant venu du devis ; un acompte de 100 000 KMF y est enregistré et la
trésorerie l'enregistre **exactement**, en une seule écriture `IN`.

## 10.3 Étanchéité des origines

Une facture naît d'une **commande** ou d'une **location**, jamais des deux : le
montant se compterait deux fois. Refusé par le déclencheur de cohérence **et**
par le contrôle anticipé de `create_customer_invoice`.

## 10.4 🟥 Une commande, au plus une facture non annulée

**La règle appliquée**, portée par un index d'unicité partiel de la même forme
que `customer_invoices_one_per_period_idx`.

**Elle est DÉDUITE de l'architecture documentée**, et le raisonnement est écrit —
la consigne §19 interdisant de reproduire le problème d'avant le LOT 23, où une
contrainte technique décidait en silence du métier :

1. `order_status` (Plan 02 §9.5) porte `INVOICED` et **aucun état partiel** ;
2. `create_invoice_from_sales_order(commande, date, échéance)` (Plan 01 §15.5)
   ne prend **ni sélection de lignes, ni quantité** ;
3. là où le Plan a **voulu** plusieurs factures — la longue durée, A-6 —, il a
   créé l'objet qui les porte, `rental_billing_periods`, et deux index disjoints.

🟥 **Point ouvert, §19.** Voir §21.1.

## 10.5 Annuler ne crée aucune impasse

| Acte | Conséquence | Éprouvé |
| --- | --- | :-: |
| Facture annulée | La commande revient à **« Confirmée »** et se refacture | ✅ |
| Commande annulée | Le devis revient à **« Accepté »** et se reconvertit | ✅ |

Sans ces retours, l'index d'unicité se libérerait alors que l'acte amont
resterait fermé. **C'est la mécanique du LOT 7**, où l'annulation d'une facture
rend la location à « À facturer ».

---

# 11. Capacités — 16, catalogue 197 → 213

Module `commerce`, ordre **11**. Menus `sales_quotes` (1), `sales_orders` (2).

| Code | Action | Sensible |
| --- | --- | :-: |
| `commerce.sales_quotes.view` | VIEW | |
| `commerce.sales_quotes.create` | CREATE | |
| `commerce.sales_quotes.update` | UPDATE | |
| `commerce.sales_quotes.validate` | VALIDATE | |
| `commerce.sales_quotes.cancel` | CANCEL | |
| `commerce.sales_quotes.export` | EXPORT | ✓ |
| `commerce.sales_quotes.download` | DOWNLOAD | ✓ |
| `commerce.sales_quotes.print` | PRINT | ✓ |
| `commerce.sales_orders.view` | VIEW | |
| `commerce.sales_orders.create` | CREATE | |
| `commerce.sales_orders.update` | UPDATE | |
| `commerce.sales_orders.validate` | VALIDATE | |
| `commerce.sales_orders.cancel` | CANCEL | |
| `commerce.sales_orders.export` | EXPORT | ✓ |
| `commerce.sales_orders.download` | DOWNLOAD | ✓ |
| `commerce.sales_orders.print` | PRINT | ✓ |

**Exactement les huit actions du Plan 02 §10.2, pour chacun des deux menus.**

## 11.1 Ce qui n'est **pas** créé

| Non créée | Raison |
| --- | --- |
| `commerce.*.invoice` | Facturer relève de `billing.customer_invoices.create` (migration 007). Une seconde capacité donnerait **deux vérités sur le même acte** |
| `commerce.*.convert` | Convertir un devis, c'est **créer une commande** |
| `commerce.*.discount` | Aucune remise n'existe (§13) |
| `commerce.*.margin` · `.cost` | Aucun coût, aucune marge (§12) |
| `commerce.purchase_*` | LOT 26 |

La migration 097 **refuse de s'appliquer** si une capacité `commerce.*` hors
liste existe.

## 11.2 Étanchéité — éprouvée

Un profil porteur de `commerce.sales_quotes.view` **seul** lit les devis
(1 ligne) et **aucune commande** (0 ligne, **sans erreur de requête**). Les deux
contrôles sont appariés : le second ne vaudrait rien sans le premier.

---

# 12. 🟥 Confidentialité — la preuve, autrement

## 12.1 Ce que le lot a tiré du LOT 24

Le LOT 24 a établi qu'un **balayage des octets** d'un PDF produit par
`@react-pdf` **ne prouve rien** : les flux sont compressés et les polices
sous-ensemblées.

**Ce lot n'en emploie aucun.** Cinq barrières le remplacent :

| # | Barrière | Où elle est éprouvée | Résultat |
| :-: | --- | --- | --- |
| 1 | **Schéma** — aucune colonne de coût sur une ligne commerciale ni de facture | Migration 097 §17, migration 098 §8, recette SQL §4, recette de production | ✅ |
| 2 | **Type** — `CommercialLine` ne peut donc pas en porter | `typecheck` | ✅ |
| 3 | **Source** — aucun modèle documentaire ne nomme le domaine du coût | `document.test.ts` | ✅ |
| 4 | **RLS** — appel direct sur la table des coûts | Recette de production | ✅ 0 ligne, **sans erreur** |
| 5 | **Différentiel** — le document d'un profil qui **lit réellement** le coût | Recette de production | ✅ identique |

## 12.2 La garde anti-vacuité

La barrière 4 ne prouverait rien si la table des coûts était vide. Un **profil
privilégié** — porteur de `catalog.services.cost.view` — est donc éprouvé
**positivement** : il lit **1 coût**. C'est ce contrôle qui donne sa valeur aux
deux autres.

## 12.3 Le différentiel, et le défaut qu'il a révélé

Le profil privilégié télécharge les mêmes documents. Ils doivent être
identiques : un coût qui aurait fui aurait changé les octets.

🟥 **Défaut découvert au premier passage.** La comparaison échouait alors que les
**longueurs étaient égales** (`écart 0`). Cause : un PDF porte, dans son
dictionnaire d'information, une **date de création**, et dans sa bande-annonce un
`/ID` dérivé du moment de production. **Deux rendus du même document ne sont
jamais identiques au bit près.**

La comparaison aurait donc échoué pour une raison **sans rapport avec ce qu'elle
cherche** — exactement le travers que le LOT 24 avait appris à traquer, dans
l'autre sens.

**Correction** : ces deux champs — **et eux seuls** — sont neutralisés avant
comparaison. Tout le reste, **flux compressés compris**, entre intact dans
l'empreinte. Et la recette **nomme le premier octet divergent** en cas d'échec,
pour qu'un défaut réel se diagnostique en un passage.

**Résultat** : devis **53 509 octets**, commande **53 613 octets**, identiques
pour les deux profils, horodatage neutralisé. *(Les tailles varient d'un passage
à l'autre : les références et les dates du décor changent. C'est l'ÉGALITÉ entre
les deux profils du même passage qui fait preuve, jamais une valeur absolue.)*

## 12.4 La charge utile de la page

Le **HTML rendu par le serveur** — et non le seul texte visible — est balayé :
un coût glissé dans une charge utile React serait invisible à l'écran et pourtant
transmis au navigateur. Aucun terme du domaine du coût n'y figure.

---

# 13. Remises — aucune, et c'est une décision

Le Plan 01 §15.1 esquissait `discount_amount`. Le **Plan 02 ne le reprend pas**,
et sa liste de capacités du LOT 25 **n'en porte aucune** — alors qu'il en crée
une, nommément, pour le PDV (`pos.sales.discount`, §10.2 LOT 28 : « consentir un
rabais engage ADIKOM »).

Bâtir une remise qu'**aucune capacité ne garderait** contredirait A-14 / DEC-024.

**Une ligne libre à prix choisi n'est pas une remise** : c'est une prestation
hors catalogue. Le prix d'une ligne de **catalogue**, lui, n'est **pas
saisissable** — la base refuse un montant transmis avec une variante, précisément
pour qu'une remise ne se glisse pas là où rien ne la garderait. **Éprouvé.**

🟥 **Point ouvert, §21.2.**

---

# 14. RLS

Patron du Plan 02 §8.2, sans exception, sur les quatre tables :

```sql
revoke all      on public.<table> from anon;
revoke delete   on public.<table> from authenticated;
revoke truncate on public.<table> from authenticated;
alter table     public.<table> enable row level security;
```

**12 policies.** `has_permission` est **enveloppée dans un sous-select** partout
— une garde de RLS s'évalue par ligne, et la recette SQL **refuse** une policy
qui l'appellerait sans.

## 14.1 Les deux élargissements d'écriture, et pourquoi ils n'en sont pas

| Table | Policy `update` accepte aussi | Raison |
| --- | --- | --- |
| `sales_quotes` | `commerce.sales_orders.create` · `.cancel` | La **conversion** écrit le statut du devis, l'annulation de la commande le rend |
| `sales_orders` | `billing.customer_invoices.create` · `.cancel` | La **facturation** écrit le statut de la commande, l'annulation le rend |

🟥 **Ce n'est pas un élargissement déguisé.** La policy ouvre la porte ; c'est le
**déclencheur de transition** qui dit laquelle de ces capacités autorise **quel
passage**. Un porteur de `billing.customer_invoices.create` **ne peut ni
confirmer, ni livrer, ni annuler** une commande. Sans ces entrées, la conversion
et la facturation échoueraient **au niveau de RLS**, avant d'atteindre le
déclencheur — et l'échec accuserait la mauvaise cause.

## 14.2 Aucun `SECURITY DEFINER`

Doctrine **D4** respectée : **aucune** des 13 fonctions métier du lot n'est
`SECURITY DEFINER`, et la migration comme la recette SQL le vérifient nommément.

---

# 15. Audit

Toutes les tables portent `fn_audit_row('commerce')`. **49 événements**
journalisés au passage de la recette, tous avec `module_code = 'commerce'`, les
changements d'état qualifiés `STATUS_CHANGE`.

`audit_detail_permission` a été **reprise de sa dernière version active**
(migration 094, régime longue durée compris) et étendue — **la leçon du LOT 22**.
Les quatre tables s'ouvrent par la capacité de **leur** menu : consulter les
devis n'ouvre pas le détail d'un événement de commande.

La migration **vérifie que neuf correspondances des lots antérieurs sont toujours
là**, et que le coût gelé comme le prix d'achat gardent **leur** lecture jusque
dans le journal.

---

# 16. Documents PDF

Deux pièces, par l'**architecture documentaire existante** — `DocumentShell`,
charte ADIKOM, logo officiel, pagination, blocs partagés. **Aucun second moteur
PDF.**

| Document | Type | Capacités |
| --- | --- | --- |
| Devis client | `devis-clients` | `sales_quotes.view` + `.download` / `.print` |
| Commande client | `commandes-clients` | `sales_orders.view` + `.download` / `.print` |

Contrairement aux cinq documents du cycle de location, ces deux pièces relèvent
de **menus distincts** : un collaborateur peut produire un devis sans produire
une commande.

## 16.1 Ce qu'ils ne portent jamais

- **aucun coût, aucune marge, aucune commission** (§12) ;
- **aucune nature de ligne** — catalogue ou libre regarde ADIKOM, pas le client ;
- **aucune mention de créance** — un devis et une commande n'appellent aucun
  règlement, et le document le **dit**.

## 16.2 DEC-024, éprouvée par la route

Un porteur de `view` **seul** reçoit **403** sur les trois modes — aperçu,
téléchargement, impression — pour les deux documents. **Six refus**, par appel
direct à la route, hors de tout masquage d'écran.

---

# 17. Sauvegarde — 54 → 58 tables

Les quatre tables entrent au périmètre, **entre le catalogue de services et le
cycle d'exploitation** :

```
… service_variant_prices, service_variant_costs,
  sales_quotes, sales_quote_lines, sales_orders, sales_order_lines,
  reservations, rentals, … customer_invoices, customer_invoice_lines, …
```

L'ordre est **vérifié paire par paire** par la migration — 25 paires, dont 14
nouvelles : une ligne de commande cite la ligne de devis dont elle est née, une
facture cite sa commande.

## 17.1 Cycle sauvegarde → réinitialisation → restauration

| Recette | Résultat |
| --- | --- |
| `db:verify:backup` | **15 contrôles**, tous réussis · périmètre à **58 tables** · 204 lignes restaurées fidèlement |
| `verify:backup` | **50 contrôles**, 0 échec · comptes, catalogue (213) et configuration intacts |

**Vérifié au-delà du compteur.** Après restauration, la chaîne complète est
intacte :

```
DEV-C-2026-000002 (converti, 350 000 KMF)
   └─▶ CDE-C-2026-000002 (facturée)  · 3 lignes tracées vers le devis
         └─▶ FAC-C-2026-000341 (émise) · 3 lignes tracées vers la commande
```

---

# 18. Migrations

| N° | Fichier | Contenu |
| :-: | --- | --- |
| **097** | `20260923000100_commerce_client_devis_et_commandes.sql` | 2 énumérations · 4 tables · 2 règles de numérotation · 13 fonctions · 6 déclencheurs de garde · 12 policies · correspondances d'audit · **16 capacités** · 20 contrôles |
| **098** | `20260923000200_facturer_une_commande_client.sql` | 4 colonnes nullables · 2 contraintes · 1 index d'unicité · 3 fonctions existantes **étendues** · 1 orchestrateur · 13 contrôles |
| **099** | `20260923000300_perimetre_de_sauvegarde_du_commerce_client.sql` | `backup_scope()` 54 → 58 · 25 paires d'ordre vérifiées |
| **100** | `20260923000400_les_conditions_d_un_acte_emis_sont_celles_qu_il_portait.sql` | Correction de la faille du §20.5 · 2 déclencheurs repris · 8 contrôles · **aucune table, aucune capacité** |

**Quatre migrations, et non une :** elles répondent à quatre questions
distinctes — « qu'est-ce qu'un devis ? », « comment une commande alimente-t-elle
la facturation en place ? », « que faut-il sauvegarder ? », « qu'est-ce qui est
figé ? » — et la reprise de l'une ne doit pas entraîner les autres.

## 18.1 🟥 La leçon du LOT 22, appliquée trois fois

Trois fonctions existantes sont **étendues**, et chacune a été **reprise de sa
dernière version active** — celle que la base rend aujourd'hui, jamais celle de
la migration qui l'a créée :

| Fonction | Ce qui a été préservé |
| --- | --- |
| `fn_customer_invoice_coherence` | Tout le régime longue durée (migration 094), à la virgule près |
| `create_customer_invoice` | Les contrôles anticipés d'unicité, l'exigence de `parties.clients.view` |
| `cancel_customer_invoice` | Le retour de la location à « À facturer », le refus sur location clôturée |
| `audit_detail_permission` | Les 9 correspondances des LOTS 20 à 23, vérifiées nommément |

## 18.2 ⚠ Un paramètre de plus crée une surcharge, pas un remplacement

`create or replace function` ne remplace que la fonction de **même signature**.
Laisser coexister l'ancienne et la nouvelle rendrait **tout appel par paramètres
nommés ambigu** — PostgreSQL refuserait alors **chaque facture** avec
« function is not unique ». Une panne totale de la facturation, découverte en
production.

Les anciennes signatures sont donc **explicitement retirées**, comme le LOT 23
l'avait fait, et la migration **vérifie qu'il n'existe qu'une seule version** de
chacune.

---

# 19. Tests unitaires

**364 tests, 18 fichiers, tous verts** — dont **30 nouveaux** pour le commerce.

| Ce qui est éprouvé | Branches |
| --- | --- |
| Montant d'une ligne | nominal · grands montants · quantité nulle, négative, décimale · prix nul, négatif, décimal |
| Total d'un document | lignes actives · **lignes archivées écartées** · document vide · toutes archivées · **ligne invalide propagée, jamais ignorée** |
| Nature d'une ligne (A-13) | catalogue · libre |
| **Péremption dérivée** (B-7) | validité passée · jour même · sans validité · accepté · converti · refusé · annulé · brouillon |
| Ce qu'un état autorise | modifiable · convertible · facturable · **déjà facturée** |
| Tables de transitions | états terminaux · `CONVERTED` et `INVOICED` jamais offerts · aucun état ne se propose lui-même · **tout état offert porte un libellé** |
| Libellés | aucun état muet · **aucune mention de remise, de marge ou de coût** |

Le contrôle structurel de `document.test.ts` a été **étendu** au domaine du coût
de service : `service_variant_costs`, `resolve_service_cost`, `unitCost`,
`purchaseCost` et deux autres termes sont désormais refusés dans tout modèle
documentaire — y compris ceux qu'un lot futur écrira.

🟥 **Un défaut qu'il a immédiatement attrapé** : le commentaire d'en-tête du
modèle commercial **nommait** la table des coûts pour expliquer son absence. Le
balayage est **lexical** et ne distingue pas un commentaire d'un appel — et c'est
délibéré : *une preuve qui se laisserait attendrir par un commentaire n'en serait
pas une*. Le commentaire a été reformulé.

---

# 20. Recettes

## 20.1 Recette SQL — `db:verify:commerce`

**28 contrôles**, tous réussis. Ce que la base tient **seule** :

les 16 capacités et aucune inventée · 4 tables, RLS, ni suppression ni TRUNCATE ·
chaque policy cite la capacité de **son** menu · aucune colonne de coût ·
`commercial_line_costs` absente · aucun `SECURITY DEFINER`, aucune surcharge ·
périmètre à 58 tables ordonné · **A-13** · prix résolu du catalogue · prix choisi
refusé sur une ligne de catalogue · 4 saisies invalides refusées · le cycle et
ses capacités · **lignes d'un devis émis figées** (4 refus) · **🟥 catalogue à
90 000, devis à 50 000** · conversion et devis conservé · **un devis, une
commande** (fonction **et** index) · facturation et ses capacités · **facture
ordinaire, 3 lignes SERVICE tracées** · **une commande, une facture** (fonction
**et** index) · émission et gel · **facture annulée → commande confirmée** ·
**commande annulée → devis accepté** · variante étrangère ou orpheline refusée ·
origines étanches · **trois index d'unicité et journal complet** · audit ·
aucune suppression possible.

## 20.2 Recette de production — `verify:commerce`

**133 contrôles, 0 échec**, contre `https://adikom-pilot.vercel.app`, avec cinq
profils et de vraies sessions.

| Section | Contrôles |
| --- | :-: |
| Sujets et catalogue | 2 |
| Décor | 2 |
| Devis, A-13, totaux, **modification autorisée d'un brouillon** | 11 |
| **Capacités séparées** (A-14, DEC-024) | 6 |
| Cycle, gel des lignes **et des conditions** | 8 |
| **🟥 Prix historique** | 4 |
| **Conversion**, devis conservé, double conversion | 11 |
| Commande et **facturation par la chaîne existante** | 16 |
| **Émission, règlement partiel (A-10), trésorerie** | 8 |
| **🟩 CAS B — commande créée directement**, livraison, refacturation | 10 |
| **🟥 Confidentialité** | 5 |
| Documents, DEC-024, différentiel, **photographie** | 15 |
| Écrans, charge utile, **facture dans son module** | 12 |
| Responsive 360 / 768 / 1440 px | 6 |
| **Annulation sans impasse** | 6 |
| Audit | 4 |
| Nettoyage et résidus | 6 |

### Ce que le CAS B ajoute

Le Plan 01 §15.2 rend l'origine d'une commande **facultative**. La recette le
joue : une commande **créée directement**, sans devis, garnie au prix du jour de
la commande, modifiée en brouillon, confirmée, **livrée** (🟩 B-6 : un statut,
jamais un bon de livraison), puis **facturée** — car la livraison n'est pas un
passage obligé, mais elle n'empêche pas la facturation non plus.

## 20.3 🟥 Anti-vacuité — la garde du LOT 24, appliquée partout

**Tout contrôle qui attend « aucune donnée » distingue une requête en erreur d'un
refus de lecture.** Un `data` vide ne vaut preuve que s'il vient **sans erreur**.

Trois paires appariées :

| Contrôle négatif | Son contrôle positif |
| --- | --- |
| Le commercial n'obtient **aucun** coût | Le profil privilégié en lit **1** |
| Un profil « devis seuls » ne voit **aucune** commande | Il voit **1** devis |
| Les colonnes de coût **n'existent pas** — la requête **échoue**, et c'est la preuve | — |

La **photographie financière** lève également une exception sur **chacune** de
ses huit lectures : elle ne compare jamais deux fois « rien ».

## 20.4 Nettoyage — et son effet vérifié

Le balayage se fait **par marqueur**, non par identifiant suivi : une recette
interrompue laisse des résidus que la liste en mémoire ne connaît pas. Il est
**rejoué tant qu'il reste quelque chose**, trois fois au plus, et ce qui
subsiste est **nommé**.

Cinq contrôles de résidus — clients, devis, services, comptes, catégories —
**tous à 0**, plus l'empreinte du jeu de démonstration, **identique**.

## 20.5 Trois défauts découverts, et corrigés

| # | Défaut | Nature | Correction |
| :-: | --- | --- | --- |
| 1 | 🟥 **Les conditions d'un acte émis n'étaient pas figées** | **PRODUIT** | Migration **100** |
| 2 | L'empreinte d'octets d'un PDF n'est pas un oracle stable (§12.3) | Recette | Horodatage et `/ID` neutralisés ; premier octet divergent nommé en cas d'échec |
| 3 | Annuler une facture encaissée exige `billing.customer_payments.cancel` | Recette | Capacité ajoutée au profil |

### 🟥 Défaut n° 1 — le seul défaut de produit du lot

**Trouvé à la relecture des gardes**, avant toute mise en service réelle.

Les déclencheurs de la migration 097 figeaient, hors brouillon, le client, la
date, la validité, le numéro et la devise — **mais ni `terms`, ni `notes`**.

Or la policy d'écriture de `sales_quotes` accepte `commerce.sales_orders.create`
et `.cancel` : **il le faut**, sans quoi la conversion échouerait au niveau de
RLS avant d'atteindre le déclencheur (§14.1). Le déclencheur restreignait bien
ces capacités aux seuls passages de statut qui les concernent — mais **rien ne
les empêchait d'écrire `terms` par un `PATCH` direct**.

Conséquence : un porteur de `commerce.sales_orders.create` **seul** — qui ne peut
ni modifier, ni émettre, ni annuler un devis — pouvait en **réécrire les
conditions**, sur un devis déjà remis au client. Les conditions sont
**imprimées sur la pièce** et font partie de ce que le client a accepté.

Faille **étroite**, qu'aucun écran n'emprunte. **Réelle tout de même** : la base
doit empêcher la modification silencieuse d'un acte engagé, et non compter sur ce
que l'interface propose.

**Correction — migration 100** :

1. `terms` **rejoint le gel**, pour le devis comme pour la commande ;
2. `notes` **exige `update`, dans tous les états**. Annoter reste possible — la
   facturation le permet depuis le LOT 7 — mais **annoter, c'est modifier** : la
   capacité est exigée, au lieu de suivre incidemment celle d'un voisin.

**Deux contrôles appariés** l'éprouvent, en base et en production : le
commercial, qui détient pourtant `update`, **ne réécrit pas** les conditions d'un
devis émis — et **annote** ses observations. Sans le second, le premier
passerait aussi si toute écriture était devenue impossible, et ne prouverait rien
du gel lui-même.

### Défaut n° 3 — une découverte utile

Depuis le LOT 8, `fn_customer_invoice_no_cancel_when_paid` refuse d'annuler une
facture tant que ses règlements vivent. Le commerce client **hérite de cette
exigence sans la modifier** — et la recette SQL la documente désormais
explicitement.

---

# 21. Points ouverts

## 21.1 🟥 Facturation partielle d'une commande

**La question.** Une commande peut-elle produire plusieurs factures — acompte à
la commande, solde à la livraison ?

**Ce qui est appliqué** : **une commande, au plus une facture non annulée**,
déduite de l'architecture documentée (§10.4) et **écrite**, non subie.

**Ce que coûterait l'autre choix** : rien d'irréversible. L'extension est
**additive** et connue — un objet « tranche de commande » entre la commande et la
facture, sur le modèle exact de `rental_billing_periods`, et deux index
disjoints comme au LOT 23.

**Conséquence si la règle actuelle est fausse** : ADIKOM devrait facturer en une
fois ce qu'elle encaisse en deux — ce que le **règlement partiel** (A-10) couvre
déjà, mais sans la pièce comptable intermédiaire.

## 21.2 🟥 Remises commerciales

**La question.** ADIKOM accorde-t-elle des remises sur devis et commandes ? Si
oui : de ligne ou globales, en pourcentage ou en montant, et **qui a le droit de
les consentir** ?

**Ce qui est appliqué** : aucune remise (§13). Une ligne libre à prix choisi
reste possible, et n'est pas présentée comme une remise.

**Ce qu'il faudrait** : une capacité pour la gouverner — le Plan 02 en a créé une
pour le PDV, et le raisonnement vaut ici.

## 21.3 Points antérieurs, intouchés

🟥 **A-7** (barème de pénalité) · 🟥 **DEC-008** (durée facturable) · 🟥 **P-2**
(coût interne des véhicules ADIKOM) · 🟥 **P-5** (fournisseur des coûts de
services) · **Plan 02 §5.7 / DEC-002**.

`service_variant_costs` **n'a été ni touchée, ni étendue**.

## 21.4 Séquencé, non ouvert

🟦 `commercial_line_costs` et la **marge commerciale** : Plan 02 §13.2, **LOT 28**.
🟦 **Devis et commandes fournisseurs** : **LOT 26**.
🟦 **Convention définitive des références** : DEC-023 §5, avant première émission
réelle.

---

# 22. Dette technique

## 22.1 Reprise du LOT 24 — non traitée, et c'était la consigne

Les recettes des **LOTS 21, 22 et 23** portent encore un balayage d'octets de PDF
**inopérant**. La consigne §36 le place **hors du périmètre** de ce lot, et il
n'a pas été transformé en chantier de réécriture.

**Ce lot n'a pas reproduit la mauvaise technique** et ne présente aucun contrôle
inopérant comme une garantie (§12).

## 22.2 Dette créée par ce lot

**Aucune connue.**

## 22.3 Limites assumées, écrites

- La **date du document** détermine le prix des lignes saisies directement. Deux
  documents, deux dates, deux prix possibles pour la même prestation — c'est la
  conséquence normale de l'historisation, et la conversion ne les mélange jamais.
- Le **client n'est pas photographié** (§7.3) — doctrine du SaaS, non un choix de
  ce lot.
- **Aucun export du détail des lignes** : les classeurs portent les totaux. Le
  détail se lit sur la fiche ou se remet sous forme de document.
- **Aucune taxe** (DEC-014 : régime non défini).

---

# 23. Démonstration

Un scénario complet est ajouté à `demo:seed`, **idempotent** et **nettoyable** :

```
DEV-C (3 lignes : 2 catalogue + 1 LIBRE)  ─émis─accepté─▶ CDE-C ─confirmée─▶ FAC-C émise
                                                                    350 000 KMF
```

Il exploite le catalogue du LOT 20, dont une variante porte une **révision
tarifaire à venir** : le devis gardera son prix le jour où elle prendra effet —
**la démonstration se vérifiera d'elle-même avec le temps**.

🟥 **Le défaut du `continue` du LOT 24 n'est pas reproduit.** Chaque étape
**retrouve** son objet et poursuit : un second passage complète ce que le premier
n'avait pas fait, et un ajout d'un lot futur atteindra un jeu DEMO déjà en place.

**Cycle éprouvé** : `demo:seed` (3 créations) → `demo:seed` (0 création,
idempotent) → `demo:clean` (1 devis, 3 lignes, 1 commande, 3 lignes, facture et
lignes retirées) → **0 résidu** → `demo:seed` (jeu complet reconstitué).

---

# 24. Validation

| Contrôle | Résultat |
| --- | --- |
| `lint` | ✅ |
| `typecheck` | ✅ |
| `test` | ✅ **364 tests**, 18 fichiers |
| `build` | ✅ **6 écrans nouveaux** : `/commerce/devis`, `/nouveau`, `/[id]`, `/commerce/commandes`, `/nouvelle`, `/[id]` |
| `db:verify:commerce` | ✅ **28 contrôles** |
| `db:verify:backup` | ✅ **15 contrôles** · périmètre **58** |
| `verify:backup` | ✅ **50 contrôles** |
| `verify:commerce` | ✅ **133 contrôles** |

## 24.1 Non-régressions — exécutées **séquentiellement**

Le LOT 24 a constaté que certaines recettes se détruisent mutuellement en
parallèle. **Aucune n'a été lancée en même temps qu'une autre.**

### Les lots que ce lot touche de près

| Recette | Lot | Contrôles | Résultat |
| --- | :-: | :-: | :-: |
| `verify:statement` | 24 | 91 | ✅ |
| `verify:billing` | 23 | 77 | ✅ |
| `verify:amendments` | 22 | 74 | ✅ |
| `verify:supplier-rates` | 21 | 61 | ✅ |
| `verify:catalog` | 20 | 49 | ✅ |

**352 contrôles**, aucun échec. Ces cinq-là comptaient le plus : le LOT 25
étend `customer_invoices`, `customer_invoice_lines` et
`audit_detail_permission`, et consomme le catalogue de services.

### Le reste du SaaS

| Recette | Contrôles | Résultat |
| --- | :-: | :-: |
| `verify:responsive` | 389 | ✅ |
| `verify:capabilities` | 217 | ✅ |
| `verify:ajustements` | 95 | ✅ |
| `verify:audit` | 82 | ✅ |
| `verify:groups` | 73 | ✅ |
| `verify:pilotage` | 60 | ✅ |
| `verify:production` | 56 | ✅ |
| `verify:customer-invoices` | 52 | ✅ |
| `verify:password-reset` | 43 | ✅ |
| `verify:customer-payments` | 36 | ✅ |
| `verify:rentals` | 34 | ✅ |
| `verify:users` | 14 | ✅ |

**1 151 contrôles**, aucun échec.

## 24.2 Total des non-régressions

**1 503 contrôles de production, aucun échec** — 352 sur les cinq lots voisins,
1 151 sur le reste du SaaS.

**Aucune recette n'a été exécutée en parallèle d'une autre.** Le LOT 24 a
constaté qu'elles se détruisent mutuellement : le nettoyage par préfixe d'un
passage supprime les sujets d'un autre, et l'échec accuse alors
l'authentification. Les dix-sept recettes ont donc défilé l'une après l'autre.

**Aucune recette n'a été modifiée pour passer.** Les deux seuls ajustements
portent sur la recette du LOT 25 elle-même, et chacun corrige un défaut de la
recette, non une attente (§20.5).

## 24.3 Ce que les non-régressions ont confirmé de plus important

| Ce qui aurait pu casser | Recette témoin | Résultat |
| --- | --- | :-: |
| `customer_invoices` étendue de 4 colonnes | `customer-invoices` · 52 | ✅ |
| `create_customer_invoice` et `add_customer_invoice_line` **remplacées** | `customer-invoices`, `billing` · 77 | ✅ |
| `cancel_customer_invoice` **remplacée** | `customer-payments` · 36 | ✅ |
| `fn_customer_invoice_coherence` **réécrite entière** | `billing` · 77, `statement` · 91 | ✅ |
| `audit_detail_permission` **réécrite entière** | `audit` · 82 | ✅ |
| Le catalogue passé de 197 à 213 | `capabilities` · 217, `groups` · 73 | ✅ |
| Une entrée de navigation de plus | `responsive` · 389 | ✅ |
| `service_variants` dotée d'un index unique | `catalog` · 49 | ✅ |

---

# 25. Livraison

| | |
| --- | --- |
| Commit applicatif | `1d64619` — les quatre tables, les seize capacités, les écrans |
| Commit de correction et de documentation | `0d56cb3` — migration 100, recettes enrichies, Module 11, DEC-049, Rapport 17 |
| **SHA éprouvé** | **`0d56cb3`** — la recette du LOT 25 a été rejouée contre ce déploiement |
| **SHA déployé** | **`0d56cb3`**, puis le commit de ce rapport — **documentaire, aucun code applicatif** |
| État Vercel | **READY** · production |
| Catalogue | **213** capacités |
| Périmètre de sauvegarde | **58** tables |
| Dernière migration | **100** |
| Résidus de recette en production | **0** |

**Le dernier SHA porteur de code applicatif est celui qui a été éprouvé.** La
recette du LOT 25 a été exécutée une dernière fois **après** le déploiement de
`0d56cb3` : 133 contrôles, aucun échec.

Le commit qui suit — celui de ce rapport — ne touche **que `RAPPORTS/`**. Vercel
le redéploie parce qu'il observe la branche, mais il ne change **ni une ligne de
code, ni une migration, ni une capacité** : le comportement mis en production est
exactement celui qui a été éprouvé.

---

# 25 bis. Nombre total de contrôles en production

| Famille | Contrôles |
| --- | ---: |
| **Recette du LOT 25** (`verify:commerce`) | **133** |
| Recette SQL du LOT 25 (`db:verify:commerce`) | 28 |
| Sauvegarde / réinitialisation / restauration | 65 |
| Non-régressions — cinq lots voisins | 352 |
| Non-régressions — reste du SaaS | 1 151 |
| **Total** | **1 729** |

**Aucun échec.** S'y ajoutent, hors production, **364 tests unitaires** sur
18 fichiers.

---

# 26. Critères de fin — état

| Critère | État |
| --- | :-: |
| Devis clients opérationnels | ✅ |
| Commandes clients opérationnelles | ✅ |
| Services du catalogue utilisables, variantes comprises | ✅ |
| 🟩 A-13 — lignes libres | ✅ |
| Prix historiques préservés | ✅ |
| Changement de catalogue sans effet rétroactif | ✅ |
| Cycles de vie du devis et de la commande | ✅ |
| Conversion devis → commande | ✅ |
| Devis conservé, commande liée à son origine | ✅ |
| Facturation réutilisant `customer_invoices` | ✅ |
| Aucun système de facturation parallèle | ✅ |
| Règlements et trésorerie existants intacts | ✅ |
| Documents PDF opérationnels | ✅ |
| Aucun coût, aucune marge exposés | ✅ |
| Permissions indépendantes | ✅ |
| RLS éprouvée, appels directs éprouvés | ✅ |
| Doubles actions protégées | ✅ |
| Sauvegarde préalable avant migration | ✅ |
| `backup_scope` à jour, cycle complet validé | ✅ |
| `lint` · `typecheck` · `test` · `build` | ✅ |
| Recette LOT 25 | ✅ |
| Non-régressions séquentielles | ✅ |
| Aucun résidu de recette | ✅ |
| GitHub à jour, Vercel READY, SHA concordant | ✅ |
| Rapport 17 complet, commité et poussé | ✅ |

---

**ADIKOM PILOT — Rapport 17**
**LOT 25 · Commerce client · DEC-049**

> Le devis propose. La commande engage. La facture réclame.
> À chaque transformation, l'acte précédent reste dans l'histoire —
> et le prix accepté par le client ne se réécrit jamais.
