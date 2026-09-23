# ADIKOM PILOT

## Module 11 — Commerce

**Version :** 1.0
**Statut :** Document de référence fonctionnelle
**Entreprise :** ADIKOM Technology & Travel
**Projet :** ADIKOM PILOT
**Périmètre :** LOT 25 — **Commerce client uniquement** (devis et commandes clients)
**Sources :** `RAPPORTS/Plan 02` §7.1, §9.1, §9.2, §9.5, §10.2, §13.2 · `RAPPORTS/Plan 01` §15 · décisions Direction A-10, A-13, A-14 · DEC-023, DEC-024, DEC-049

---

# 1. Objet du module

Le module **Commerce** enregistre les actes commerciaux qui précèdent la
facturation : ce qu'ADIKOM **propose**, puis ce que le client **commande**.

Il ne facture rien lui-même, n'encaisse rien et ne tient aucune trésorerie. Il
s'insère entre deux briques déjà livrées, et ne réécrit ni l'une ni l'autre :

```
CATALOGUE DE SERVICES (LOT 20)
        │
        ▼
   DEVIS CLIENT  ──────────▶  COMMANDE CLIENT
        │  accepté, converti          │  confirmée, facturée
        │  (conservé)                 ▼
        │                    FACTURE CLIENT (LOT 7)
        │                             ▼
        │                    RÈGLEMENT CLIENT (LOT 8)
        │                             ▼
        └───────────────────▶ TRÉSORERIE (LOT 6)
```

## 1.1 Ce que le LOT 25 livre

- les **devis clients**, leurs lignes et leur cycle de vie ;
- les **commandes clients**, leurs lignes et leur cycle de vie ;
- la **conversion** d'un devis accepté en commande ;
- la **facturation** d'une commande **par la chaîne existante** ;
- les **documents** PDF du devis et de la commande ;
- les **exports** des deux listes ;
- **16 capacités**, huit par menu.

## 1.2 Ce que le LOT 25 ne livre pas

- **aucun commerce fournisseur** : devis et commandes fournisseurs relèvent du
  LOT 26, et aucune entrée de navigation ne les annonce (DEC-042 §d) ;
- **aucune remise** : ni de ligne, ni globale (§8) ;
- **aucun coût, aucune marge** : la photographie du coût commercial relève du
  LOT 28 (§9) ;
- **aucun produit**, aucun stock, aucun entrepôt : la partie Produits du
  catalogue n'existe pas ;
- **aucune livraison documentée** : la réception d'une prestation se constate
  par un statut, pas par un bon de livraison (décision B-6) ;
- **aucune taxe** (DEC-014 : régime non défini) ;
- **aucune facturation partielle** d'une commande (§7.4).

---

# 2. Les deux entités, et pourquoi elles sont deux

🟩 **Doctrine DEC-006, reconduite.** « Une réservation n'est pas une location.
Deux entités, deux jeux de statuts, reliés par une référence, jamais une valeur
partagée. »

Un devis n'est pas une commande à un statut près :

| | Devis | Commande |
| --- | --- | --- |
| Se refuse | **oui** — le client décline | non |
| Durée de validité | **oui** | non |
| Date de livraison attendue | non | **oui** |
| Engage ADIKOM | non — c'est une proposition | oui, des deux côtés |
| Produit une facture | non | **oui** |

Les fondre obligerait à porter des colonnes vides la moitié du temps et à
écrire des statuts qui n'ont de sens que dans un cas.

---

# 3. Le devis client

## 3.1 Identité

| Donnée | Règle |
| --- | --- |
| **Référence** | `DEV-C-2026-000001` — préfixe, année, six chiffres, remise à zéro annuelle. Même forme que `FAC-C` (§10) |
| **Client** | Le client du module Tiers, **jamais recopié**. Aucune table « customer » parallèle |
| **Date du devis** | Obligatoire. **Elle détermine le prix catalogue** appliqué à chaque ligne |
| **Validité** | **Facultative**, et jamais inventée (§3.3) |
| **Devise** | KMF (DEC-010) |
| **Conditions**, **Observations** | Texte libre, repris sur le document |

## 3.2 Cycle de vie

```
BROUILLON ──émettre──▶ ÉMIS ──accepter──▶ ACCEPTÉ ──convertir──▶ CONVERTI
    │                    │                   │
    │                    └──refuser──▶ REFUSÉ │
    │                    │                   │
    └────────────────────┴───────────────────┴──annuler──▶ ANNULÉ
```

| État | Ce qu'il signifie | Capacité de l'atteindre |
| --- | --- | --- |
| **Brouillon** | Se prépare. En-tête et lignes librement modifiables | `create` |
| **Émis** | Remis au client. **En-tête, conditions et lignes figés** | `validate` |
| **Accepté** | Le client a donné son accord | `validate` |
| **Refusé** | Le client a décliné. Conservé comme acte antérieur | `validate` |
| **Converti** | Une commande en est née. **Ne se déclare pas** : il résulte de la création de la commande | `sales_orders.create` |
| **Annulé** | Retiré par ADIKOM. Historisé, jamais supprimé | `cancel` |

**Pourquoi le refus relève de `validate` et non de `cancel`** : enregistrer la
réponse du client — favorable ou non — est le **même geste**, par la même
personne, sur le même écran. Annuler est un acte d'ADIKOM, pas une réponse du
client. Un devis refusé n'est pas un devis annulé.

**Un devis converti revient à « accepté »** si sa commande est annulée (§7.5).
C'est le seul chemin de retour, et il n'est ouvert qu'à
`commerce.sales_orders.cancel`.

## 3.3 Validité et péremption

🟩 **Décision B-7 (Plan 01 §24.2).** « Un devis expiré change-t-il de statut
tout seul ? **Non** — aucun ordonnanceur. **Dérivé** de `valid_until`, comme
`OVERDUE`. »

- La validité est une **date**, pas une durée.
- **Aucune durée par défaut n'est proposée.** Aucune politique commerciale de
  validité n'est écrite chez ADIKOM ; en proposer une reviendrait à la décider
  (`CLAUDE.md` §55). Le champ reste vide tant que personne ne le renseigne, et
  le document le dit.
- **Aucun statut « expiré » n'existe.** La péremption se **calcule** à la
  lecture, de la date de validité et du jour comorien. Un statut écrit
  supposerait une tâche planifiée que le projet n'a pas, et mentirait entre deux
  passages.
- Elle ne concerne qu'un devis **encore en attente de réponse** : un accord
  donné le 1ᵉʳ ne s'évapore pas le 30.
- L'écran **signale** la péremption et invite à décider explicitement. Il ne
  décide rien.

---

# 4. Les lignes — 🟩 A-13

🟩 **Décision A-13 : VALIDÉE.** « Un devis / une commande peut-il porter une
ligne libre, sans service au catalogue ? **Oui.** »

## 4.1 Deux natures, un seul modèle

| | **Ligne de catalogue** | **Ligne libre** |
| --- | --- | --- |
| Service | obligatoire | **aucun** |
| Variante | obligatoire | aucune |
| Désignation | **copiée** du catalogue, ajustable | **saisie** |
| Prix unitaire | **résolu du catalogue**, à la date du document | **saisi** |
| Quantité | saisie, entière | saisie, entière |

La nature d'une ligne n'est **pas une colonne** : elle se lit de la présence du
service. Une colonne de plus aurait pu contredire la donnée.

**Aucun service « Divers » n'est créé** pour faire entrer une ligne libre dans
le modèle du catalogue. C'est le modèle qui accueille la ligne libre.

## 4.2 Ce que la base garantit

- `service_id` et `service_variant_id` **vont ensemble ou pas du tout** ;
- la variante **appartient bien à son service** — par une clé étrangère
  **composite**, et non par un déclencheur : un déclencheur lirait la table des
  variantes **à travers RLS** et conclurait « introuvable » pour un appelant
  sans `catalog.services.view` ;
- quantité et prix unitaire sont des **entiers strictement positifs** ;
- une ligne s'**archive**, elle ne s'efface pas (doctrine D6).

## 4.3 Quantité

🟩 **Décision B-14.** La quantité reste **entière**, comme sur les lignes de
facture. Un décimal appellerait une règle d'arrondi monétaire que personne n'a
arrêtée.

---

# 5. 🟥 Le prix figé

C'est la règle centrale du module.

## 5.1 La règle

> **Une ligne commerciale porte une COPIE du prix, prise à la date du document.
> Aucun changement ultérieur du catalogue ne la réécrit.**

```
Catalogue :  Service A — 50 000 KMF depuis le 01/09

01/10  Devis établi              ──▶  ligne : 50 000 KMF   (copie)
10/10  Catalogue relevé à 90 000
15/10  Devis consulté            ──▶  ligne : 50 000 KMF   ← INCHANGÉE
15/10  Devis converti            ──▶  commande : 50 000 KMF ← RECOPIÉE
20/10  Commande facturée         ──▶  facture : 50 000 KMF  ← RECOPIÉE
```

## 5.2 Où le prix est proposé, et où il devient figé

| Moment | Ce qui se passe |
| --- | --- |
| **Ajout d'une ligne** | Le résolveur `resolve_service_price(variante, date du document)` est interrogé. **C'est le seul endroit.** |
| **Immédiatement après** | Sa réponse est **copiée** dans `unit_price`, et la désignation dans `label` |
| **Émission du devis** | Les lignes sont **figées** : plus aucun ajout, aucune modification, aucun retrait |
| **Conversion** | Les lignes sont **recopiées** de devis à commande. Le catalogue **n'est pas réinterrogé** |
| **Facturation** | Les lignes sont **recopiées** de commande à facture. Le catalogue **n'est pas réinterrogé** |

## 5.3 Ce qui est photographié, et pourquoi

| Donnée | Copiée ? | Raison |
| --- | :-: | --- |
| Prix unitaire | ✅ | Le montant proposé au client l'engage |
| Désignation | ✅ | Un service **renommé** ne doit pas rendre faux un devis d'hier |
| Quantité | ✅ | Elle est propre au document |
| Service, variante | référence | **Traçabilité** de l'origine, non valorisation |
| **Client** | ❌ | Voir §6 |
| **Coût d'achat** | ❌ | Voir §9 |

---

# 6. Le client — aucune photographie

**Doctrine existante, reconduite sans changement.** Les factures clients
(LOT 7) ne recopient ni le nom, ni l'adresse, ni le téléphone du client : elles
désignent la fiche et la lisent à l'affichage.

Le commerce client fait **exactement pareil**. Un devis désigne
`clients.id` ; son document lit la fiche au moment où il est produit.

**Conséquence assumée** : un changement d'adresse modifie l'adresse imprimée sur
un document réédité. C'est la doctrine en place pour toutes les pièces du SaaS,
et le LOT 25 ne l'infléchit pas — introduire un snapshot ici, et là seulement,
créerait deux règles pour la même question.

---

# 7. La commande client

## 7.1 Identité

| Donnée | Règle |
| --- | --- |
| **Référence** | `CDE-C-2026-000001` |
| **Client** | Le client du module Tiers |
| **Devis d'origine** | **Facultatif** (§7.2) |
| **Date de commande** | Obligatoire. Détermine le prix catalogue des lignes saisies directement |
| **Livraison attendue** | Facultative |

## 7.2 Deux origines

| Cas | Chemin | Où |
| :-: | --- | --- |
| **A** | Conversion d'un **devis accepté** | Depuis la fiche du devis |
| **B** | **Création directe**, sans proposition préalable | Écran « Nouvelle commande » |

Le **cas B est prévu par l'architecture** : le Plan 01 §15.2 écrit
`sales_quote_id uuid → sales_quotes, -- origine facultative`. Ce n'est pas une
facilité ajoutée : c'est la colonne telle qu'elle a été conçue.

## 7.3 Cycle de vie

```
BROUILLON ──confirmer──▶ CONFIRMÉE ──livrer──▶ LIVRÉE
                             │                    │
                             └─────facturer───────┴──▶ FACTURÉE
                                                          │
   (annulation de la facture)  ◀───────────────────────────┘

BROUILLON · CONFIRMÉE · LIVRÉE ──annuler──▶ ANNULÉE
```

| État | Ce qu'il signifie | Capacité |
| --- | --- | --- |
| **Brouillon** | Se prépare. Lignes modifiables | `create` |
| **Confirmée** | Engagement pris. **Conditions et lignes figées**, commande facturable | `validate` |
| **Livrée** | Prestation constatée. **Aucun bon de livraison** (B-6) | `validate` |
| **Facturée** | Une facture client en est née. **Ne se déclare pas** | `billing.customer_invoices.create` |
| **Annulée** | Historisée. Son devis d'origine redevient « accepté » | `cancel` |

**La livraison n'est pas un passage obligé.** Le Plan 01 §15.5 facture depuis
`CONFIRMED`. `DELIVERED` est un **constat**, pas une étape imposée.

## 7.3 bis 🟥 Ce qui se fige, et ce qui reste annotable

| Colonne | Hors brouillon | Pourquoi |
| --- | --- | --- |
| Client, dates, numéro, devise, origine | **gelées** | Elles fondent l'acte |
| **Conditions** (`terms`) | **gelées** | **Imprimées sur la pièce**, acceptées par le client |
| **Observations** (`notes`) | annotables, sous `update` | Commentaire interne. La facturation le permet depuis le LOT 7 |
| Lignes | **gelées**, retrait compris | Retirer une ligne change le total |
| Statut, horodatages, motif | écrits par l'acte | Chacun sous la capacité de son passage |

🟥 **Annoter, c'est modifier.** Une observation postérieure exige
`commerce.sales_quotes.update` ou `commerce.sales_orders.update` **dans tous les
états** — et non la capacité d'un voisin. La policy d'écriture admet
`commerce.sales_orders.create` pour la conversion : sans cette garde, ce porteur
aurait pu annoter n'importe quel devis (DEC-049 §m).

## 7.4 🟦 Une commande, au plus une facture non annulée

**La règle appliquée.** Une commande produit **au plus une facture non
annulée**. Elle est portée par un index d'unicité partiel, de la même forme que
celui des périodes facturables de location.

**D'où elle vient** — elle est **déduite de l'architecture documentée**, et le
raisonnement est écrit plutôt que subi :

1. `order_status` (Plan 02 §9.5) porte `INVOICED`, et **aucun état partiel**.
   C'est un statut de la commande **entière**.
2. `create_invoice_from_sales_order(commande, date, échéance)` (Plan 01 §15.5)
   ne prend **ni sélection de lignes, ni quantité à facturer**. Sa signature ne
   sait pas exprimer une facturation partielle.
3. Là où le Plan a **voulu** plusieurs factures — la longue durée, A-6 —, il a
   créé l'objet qui les porte : `rental_billing_periods`, et deux index
   disjoints (Plan 02 §19.3). Ici, rien de tel n'existe.

**🟥 Point ouvert, signalé à la Direction.** Si ADIKOM facture réellement ses
commandes par tranches — acompte à la commande, solde à la livraison —,
l'extension est connue et **additive** : un objet « tranche de commande » entre
la commande et la facture, sur le modèle exact des périodes facturables. Rien
dans ce lot ne l'empêche. **La question n'a pas été tranchée par le LOT 25 :
elle est posée.**

## 7.5 Annuler ne crée aucune impasse

| Acte | Conséquence |
| --- | --- |
| **Facture annulée** | La commande revient à **« Confirmée »** et se refacture |
| **Commande annulée** | Le devis revient à **« Accepté »** et se reconvertit |

Sans ces retours, une facture annulée par erreur laisserait la commande
« Facturée » pour toujours, et un devis converti par erreur resterait
« converti » sans commande vivante — alors que l'index d'unicité, lui, se
libère. Les deux doivent bouger ensemble.

C'est **exactement la mécanique du LOT 7**, où l'annulation d'une facture rend
la location à « À facturer ».

---

# 8. Remises — non implémentées

🟥 **Le LOT 25 ne construit aucun moteur de remises.**

- Le Plan 01 §15.1 esquissait un `discount_amount` par ligne ;
- le **Plan 02 ne le reprend pas**, et sa liste de capacités du LOT 25 (§10.2)
  **n'en porte aucune** ;
- alors qu'il en crée une, **nommément**, pour le point de vente :
  `pos.sales.discount` (§10.2, LOT 28) — « encaisser 60 000 sur 60 000 dus et
  accorder 10 000 de remise ne sont pas le même geste ».

Bâtir une remise qu'aucune capacité ne garderait contredirait A-14 / DEC-024 :
consentir un rabais engage ADIKOM, et doit pouvoir s'attribuer séparément.

**Une ligne libre à prix choisi n'est pas une remise.** C'est une prestation
hors catalogue, à un montant convenu, et le document ne prétend pas le
contraire.

---

# 9. 🟥 Confidentialité — aucun coût, aucune marge

## 9.1 Ce que le module manipule

**Le prix de vente, et lui seul.**

Le prix d'achat d'un service vit dans sa propre table, gardée par
`catalog.services.cost.view` (LOT 20, DEC-043 §e). Le commerce client ne
l'interroge **jamais**.

## 9.2 Pourquoi la ligne ne porte aucun coût

Le Plan 01 §15.1 plaçait `unit_cost` sur la ligne. Le **Plan 02 §9.3 l'en
retire** :

> « Si le prix d'achat sort de la variante pour des raisons de confidentialité,
> le coût copié doit sortir de la ligne pour la même raison — sinon la
> confidentialité est contournable par la facture. »

Il le renvoie à une table `commercial_line_costs`, que le **§13.2 assigne au
LOT 28**. Le LOT 25 ne la crée donc pas, et ses lignes ne portent **aucun
coût** — vérifié par la migration elle-même.

**Conséquence assumée** : la fonction `sales_quote_margin()` du Plan 01
**n'existe pas**. Une marge sans coût serait un mensonge ; une table de coûts
anticipée serait une surconstruction.

## 9.3 Comment la confidentialité est prouvée

🟥 **Pas par un balayage d'octets.** Le LOT 24 a établi qu'un balayage du PDF
produit **ne prouve rien** : les flux sont compressés et les polices
sous-ensemblées, si bien qu'un coût présent n'y apparaîtrait pas en clair.

| Barrière | Nature | Où elle est éprouvée |
| :-: | --- | --- |
| 1 | **Schéma** — aucune colonne de coût sur une ligne commerciale | Migration 097, recette SQL |
| 2 | **Type** — `CommercialLine` ne peut donc pas en porter, et le compilateur le refuse | `typecheck` |
| 3 | **Source** — aucun modèle documentaire ne nomme le domaine du coût | `document.test.ts` |
| 4 | **RLS** — un appel direct sur la table des coûts ne rend rien | Recette de production |
| 5 | **Différentiel** — le document d'un profil qui **lit réellement** le coût est identique, octet pour octet, à celui d'un profil qui ne le lit pas | Recette de production |

La barrière 5 est la seule qui tienne **même lorsque le demandeur détient la
capacité de lire le coût** — et elle n'a de valeur que parce que la recette
prouve d'abord que ce profil le lit vraiment.

---

# 10. Numérotation

| Objet | Format | Règle |
| --- | --- | --- |
| Devis client | `DEV-C-2026-000001` | `sales_quote` |
| Commande client | `CDE-C-2026-000001` | `sales_order` |

**Aucun second numéroteur.** Les deux règles rejoignent `numbering_rules`, et
`next_number` les sert comme elle sert `FAC-C` — en verrouillant sa règle, de
sorte que deux saisies simultanées ne produisent jamais le même numéro.

**Format provisoire, comme `FAC-C`.** DEC-023 §3 réserve la convention
définitive (séries `BIS-DVCL-A0001`) à une extension de `next_number`
explicitement reportée, et son §5 exige que chaque code de type soit confirmé
avant première émission. Le Plan 01 §15.5 tranche pour le présent lot :
« Format provisoire, comme `FAC-C` ».

---

# 11. Capacités — 16, et pas une de plus

Module `commerce`, ordre **11**. Deux menus, **huit actions chacun** — celles du
Plan 02 §10.2, exactement.

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `commerce.sales_quotes.view` | VIEW | | Consulter les devis clients |
| `commerce.sales_quotes.create` | CREATE | | Créer un devis client |
| `commerce.sales_quotes.update` | UPDATE | | Modifier un devis client |
| `commerce.sales_quotes.validate` | VALIDATE | | Émettre, enregistrer la réponse du client |
| `commerce.sales_quotes.cancel` | CANCEL | | Annuler un devis client |
| `commerce.sales_quotes.export` | EXPORT | ✓ | Exporter la liste |
| `commerce.sales_quotes.download` | DOWNLOAD | ✓ | Télécharger le document |
| `commerce.sales_quotes.print` | PRINT | ✓ | Imprimer le document |
| `commerce.sales_orders.view` | VIEW | | Consulter les commandes clients |
| `commerce.sales_orders.create` | CREATE | | Créer une commande, **convertir un devis** |
| `commerce.sales_orders.update` | UPDATE | | Modifier une commande client |
| `commerce.sales_orders.validate` | VALIDATE | | Confirmer, constater la livraison |
| `commerce.sales_orders.cancel` | CANCEL | | Annuler une commande client |
| `commerce.sales_orders.export` | EXPORT | ✓ | Exporter la liste |
| `commerce.sales_orders.download` | DOWNLOAD | ✓ | Télécharger le document |
| `commerce.sales_orders.print` | PRINT | ✓ | Imprimer le document |

## 11.1 Ce qui n'est **pas** créé

| Non créé | Raison |
| --- | --- |
| `commerce.*.invoice` | Facturer une commande relève de `billing.customer_invoices.create`, qui existe depuis la migration 007. Une seconde capacité donnerait **deux vérités sur le même acte** |
| `commerce.*.convert` | Convertir un devis, c'est **créer une commande** : `commerce.sales_orders.create` |
| `commerce.*.discount` | Aucune remise n'existe (§8) |
| `commerce.*.margin`, `.cost` | Aucun coût, aucune marge (§9) |
| `commerce.purchase_*` | Le commerce fournisseur est le LOT 26 |

## 11.2 Étanchéité

**Consulter les devis n'ouvre pas les commandes**, et réciproquement. Ce sont
deux menus, deux capacités (A-14). Une fiche de devis converti dont le lecteur
n'a pas `commerce.sales_orders.view` **dit** que la commande existe et que sa
référence ne lui est pas communiquée — elle ne la tait pas (DEC-017).

## 11.3 Capacités exigées par les actes composés

| Acte | Capacités exigées |
| --- | --- |
| **Créer un devis** | `sales_quotes.create` + `.view` + `parties.clients.view` |
| **Ajouter une ligne de catalogue** | `sales_quotes.create` **ou** `.update`, + `.view`, + `catalog.services.view` |
| **Convertir un devis** | `sales_orders.create` + `sales_orders.view` + `sales_quotes.view` + `parties.clients.view` |
| **Facturer une commande** | `sales_orders.view` + `billing.customer_invoices.create` + `.view` + `parties.clients.view`. **Pas `.issue`** : émettre reste un acte distinct |
| **Annuler une facture de commande** | `billing.customer_invoices.cancel` + `.view` + `billing.customer_payments.view` + `sales_orders.view` |

---

# 12. Articulation avec la facturation — aucun système parallèle

## 12.1 Le principe

`create_invoice_from_sales_order` est un **orchestrateur**. Elle n'écrit
elle-même **aucune ligne** dans les tables de facturation : elle appelle les
fonctions existantes, qui portent déjà leurs cinq couches de contrôle.

```
create_invoice_from_sales_order(commande, date, échéance)
        │
        ├─▶ create_customer_invoice(…)          ← EXISTANTE, non dupliquée
        │
        └─▶ add_customer_invoice_line(…)        ← EXISTANTE, une par ligne active
                 kind = 'SERVICE'
                 label · quantité · prix unitaire     ← COPIÉS de la commande
                 service · variante · ligne d'origine ← traçabilité
```

**La facture naît en BROUILLON.** L'émettre reste un acte distinct, sous
`billing.customer_invoices.issue`, depuis l'écran de facturation : c'est
l'émission qui reconnaît la créance.

## 12.2 Ce qu'une facture issue d'une commande est

Une `customer_invoices` **ordinaire**, en tous points :

- même numérotation `FAC-C` ;
- même écran, même liste, mêmes filtres ;
- même émission, même annulation ;
- mêmes **règlements**, **paiement partiel compris** (🟩 A-10) ;
- mêmes **écritures de trésorerie** ;
- même place dans le **pilotage** et les **statistiques**.

## 12.3 Étanchéité des origines

Une facture naît d'une **commande** ou d'une **location**, jamais des deux : le
montant se compterait deux fois. La base le refuse.

## 12.4 Colonnes ajoutées — toutes nullables

| Table | Colonne | Rôle |
| --- | --- | --- |
| `customer_invoices` | `sales_order_id` | La commande dont la facture est née |
| `customer_invoice_lines` | `service_id` | Traçabilité de l'origine |
| `customer_invoice_lines` | `service_variant_id` | idem |
| `customer_invoice_lines` | `source_order_line_id` | La ligne de commande d'origine |

**Aucune donnée existante n'est modifiée.** Les factures de location et de
services déjà en base reçoivent `NULL` partout et se comportent exactement comme
avant.

**Aucune colonne de coût n'est ajoutée** (§9.2).

---

# 13. Documents

Deux pièces, produites par l'**architecture documentaire existante** —
`DocumentShell`, charte ADIKOM, logo officiel, pagination, blocs partagés.
Aucun second moteur PDF.

| Document | Type | Capacités |
| --- | --- | --- |
| **Devis client** | `devis-clients` | `sales_quotes.view` + `.download` / `.print` |
| **Commande client** | `commandes-clients` | `sales_orders.view` + `.download` / `.print` |

Contrairement aux cinq documents du cycle de location, qui partagent les
capacités du contrat, ces deux pièces relèvent de **menus distincts** : un
collaborateur peut légitimement produire un devis sans produire une commande.

## 13.1 Ce que les documents portent

Désignation, quantité, prix unitaire, montant, total. L'état du document, en
toutes lettres — un brouillon **dit** qu'il est un brouillon, un devis converti
dit qu'il a donné lieu à une commande.

## 13.2 Ce qu'ils ne portent jamais

- **aucun coût, aucune marge, aucune commission** (§9) ;
- **aucune nature de ligne** : catalogue ou libre regarde ADIKOM, pas le client,
  qui achète une prestation et non une entrée de référentiel ;
- **aucune mention de créance** sur un devis ou une commande : ni l'un ni
  l'autre n'appelle de règlement.

---

# 14. Audit

| Acte | Type | Module |
| --- | --- | --- |
| Création d'un devis, d'une commande | `CREATE` | `commerce` |
| Modification d'un en-tête, d'une ligne | `UPDATE` | `commerce` |
| Émission, acceptation, refus, annulation | `STATUS_CHANGE` | `commerce` |
| Conversion en commande | `STATUS_CHANGE` + `CREATE` | `commerce` |
| Confirmation, livraison | `STATUS_CHANGE` | `commerce` |
| Facturation | `CREATE` | `billing` |
| Téléchargement, impression, export | `DOWNLOAD` / `PRINT` / `EXPORT` | `commerce` |
| Refus d'accès à un document | `ACCESS_DENIED` | `commerce` |

**Le journal n'ouvre pas ce que la table ferme** (DEC-038). Le détail
avant/après d'un événement de devis exige `commerce.sales_quotes.view` ; celui
d'une commande, `commerce.sales_orders.view`. **Deux menus, deux capacités,
jusque dans le journal.**

---

# 15. Sauvegarde

Les quatre tables entrent au périmètre, **entre le catalogue de services et la
facturation** :

```
… service_variants, service_variant_prices, service_variant_costs,
  sales_quotes, sales_quote_lines, sales_orders, sales_order_lines,
  reservations, rentals, … customer_invoices, customer_invoice_lines, …
```

**54 → 58 tables.** L'ordre est impératif : une ligne de commande cite la ligne
de devis dont elle est née, et une facture cite sa commande.

---

# 16. Limites et points ouverts

| # | Point | Nature |
| :-: | --- | --- |
| 1 | **Facturation partielle d'une commande** — acompte puis solde | 🟥 **Décision Direction** (§7.4). Extension additive connue |
| 2 | **Remises commerciales** — de ligne ou globales | 🟥 **Décision Direction** (§8). Aucune capacité ne les garderait aujourd'hui |
| 3 | **Marge commerciale** — coût copié sur la ligne | 🟦 **Séquencé au LOT 28** (Plan 02 §13.2) |
| 4 | **Convention définitive des références** | 🟦 DEC-023 §5 — à confirmer avant première émission réelle |
| 5 | **Devis et commandes fournisseurs** | 🟦 LOT 26 |
| 6 | **Produits** | 🟦 Non développés. Le modèle de ligne les accueillera sans réécriture |

---

**ADIKOM PILOT — Module 11 : Commerce**
**LOT 25 · DEC-049 · Commerce client**
