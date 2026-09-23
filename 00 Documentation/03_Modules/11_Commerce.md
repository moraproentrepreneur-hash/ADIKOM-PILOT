# ADIKOM PILOT

## Module 11 — Commerce

**Version :** 1.0
**Statut :** Document de référence fonctionnelle
**Entreprise :** ADIKOM Technology & Travel
**Projet :** ADIKOM PILOT
**Périmètre :** LOT 25 — **Commerce client** (devis et commandes clients) · LOT 26 — **Commerce fournisseur** (devis et commandes fournisseurs, §17 à §26)
**Sources :** `RAPPORTS/Plan 02` §6, §7.1, §9.1, §9.2, §9.5, §10.2, §13.2, §18.2 · `RAPPORTS/Plan 01` §15 · décisions Direction A-10, A-13, A-14, B-6, B-7 · DEC-023, DEC-024, DEC-044, DEC-049, DEC-050, DEC-051, DEC-052

> **Comment lire ce document.** Les §1 à §16 décrivent le **commerce client**
> (LOT 25). Les §17 à §26 décrivent le **commerce fournisseur** (LOT 26), et ne
> répètent que ce qui **diffère** : tout ce qu'ils ne contredisent pas vaut des
> deux côtés.

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

## 1.1 Ce que le LOT 25 livre — commerce client

- les **devis clients**, leurs lignes et leur cycle de vie ;
- les **commandes clients**, leurs lignes et leur cycle de vie ;
- la **conversion** d'un devis accepté en commande ;
- la **facturation** d'une commande **par la chaîne existante** ;
- les **documents** PDF du devis et de la commande ;
- les **exports** des deux listes ;
- **16 capacités**, huit par menu.

## 1.2 Ce que le LOT 25 ne livre pas — commerce client

- 🟩 **le commerce fournisseur** — devis et commandes fournisseurs — a été livré
  par le **LOT 26** (DEC-052). Il est décrit aux §17 à §26 ;
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

> 🟩 **Question close par DEC-050, le 23 septembre 2026.** La Direction **ne
> retient pas** la facturation par tranches : **une commande client produit au
> plus une facture client non annulée**. Le paiement progressif se fait par
> **plusieurs règlements sur cette même facture** (A-10, module du LOT 8).
> **L'objet « tranche de commande » ne sera pas construit.** La règle décrite
> ci-dessus est **définitive** — elle n'est plus une déduction d'architecture.

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

> 🟩 **Question close par DEC-051, le 23 septembre 2026.** La Direction valide le
> principe des remises commerciales, **exclusivement en montant fixe KMF** —
> **aucun pourcentage** —, à deux niveaux facultatifs : **remise de ligne** et
> **remise globale du document**, cette dernière s'appliquant **après** les
> remises de lignes. Les accorder exigera une **permission indépendante** (A-14).
> **L'implémentation est différée à un lot approprié** : tout ce que décrit ce §8
> reste l'état exact du module au 23 septembre 2026, et **aucune capacité de
> remise n'existe**.

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
| `commerce.purchase_*` | 🟩 **Livrées par le LOT 26** (§24). Elles n'existaient pas au LOT 25 |

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

**54 → 58 tables** au LOT 25 ; **58 → 62** au LOT 26 (§25.3). L'ordre est
impératif : une ligne de commande cite la ligne de devis dont elle est née, et
une facture cite sa commande.

---

# 16. Limites et points ouverts

| # | Point | Nature |
| :-: | --- | --- |
| 1 | **Facturation partielle d'une commande** — acompte puis solde | 🟩 **Tranchée — DEC-050** : **non retenue** (§7.4). Le paiement progressif passe par les règlements |
| 2 | **Remises commerciales** — de ligne ou globales | 🟩 **Tranchée — DEC-051** : **montant fixe KMF**, permission indépendante, **implémentation différée** (§8) |
| 3 | **Marge commerciale** — coût copié sur la ligne | 🟦 **Séquencé au LOT 28** (Plan 02 §13.2) |
| 4 | **Convention définitive des références** | 🟦 DEC-023 §5 — à confirmer avant première émission réelle |
| 5 | **Devis et commandes fournisseurs** | 🟩 **Livrés — LOT 26, DEC-052** (§17 à §26). Le commerce client n'en a été ni modifié ni touché |
| 6 | **Produits** | 🟦 Non développés. Le modèle de ligne les accueillera sans réécriture |

> 🟩 **Points 1 et 2 — clos le 23 septembre 2026.** Ils cessent d'être des
> questions ouvertes : ils deviennent des règles. **Le module, lui, n'a pas
> changé** — DEC-050 confirme le comportement déjà en production, et DEC-051
> diffère son implémentation.

---

# PARTIE II — LE COMMERCE FOURNISSEUR (LOT 26)

# 17. Objet, et ce qui change de sens

Le commerce fournisseur enregistre les actes d'ACHAT qui précèdent la facture
reçue : ce qu'un fournisseur **propose**, puis ce qu'ADIKOM lui **commande**.

Il ne paie rien, n'impute rien et ne tient aucune trésorerie. Il s'insère entre
deux briques déjà livrées, et ne réécrit ni l'une ni l'autre :

```
CATALOGUE DE SERVICES (LOT 20)
        │
        ▼
 DEVIS FOURNISSEUR ──────────▶  COMMANDE FOURNISSEUR
        │  retenu, converti            │  passée, facturée
        │  (conservé)                  ▼
        │                    FACTURE FOURNISSEUR (LOT 5)
        │                              ▼
        │                    RÈGLEMENT FOURNISSEUR (LOT 6)
        │                              ▼
        └───────────────────▶  TRÉSORERIE (LOT 6)
```

## 17.1 🟥 Un « devis fournisseur » est un document REÇU

C'est le point de vocabulaire qui gouverne tout le reste. **ADIKOM n'émet aucun
devis à destination d'un fournisseur** : elle **enregistre l'offre** qu'il lui a
remise. La pièce est reçue, comme une facture fournisseur l'est (Module 07 §28).

Trois conséquences :

| | Devis **client** | Devis **fournisseur** |
| --- | --- | --- |
| Qui produit le document | ADIKOM | **le fournisseur** |
| L'acte d'ADIKOM | *émettre* | **enregistrer, puis décider** |
| Référence externe | aucune | **celle du fournisseur** (§18.2) |
| Le prix vient | **du catalogue**, à la date | **de l'offre**, saisi (§19) |

## 17.2 Ce que le LOT 26 livre

- les **devis fournisseurs**, leurs lignes et leur cycle de vie ;
- les **commandes fournisseurs**, leurs lignes et leur cycle de vie ;
- la **conversion** d'une offre retenue en commande ;
- l'enregistrement de la **facture reçue** **par la chaîne existante** ;
- les **documents** PDF de l'offre et du bon de commande ;
- les **exports** des deux listes ;
- **16 capacités**, huit par menu — dont **deux lectures sensibles** (§23).

## 17.3 Ce que le LOT 26 ne livre pas

- **aucune marge** : « on n'a pas de marge sur un achat » (Plan 01 §15.3) ;
- **aucune remise fournisseur** : DEC-051 porte sur les remises **clients**, et
  rien n'est décidé sur les rabais consentis par un fournisseur. Le prix d'une
  ligne est le **prix net convenu**, et le document ne prétend pas autre chose ;
- **aucun produit, aucun stock, aucun entrepôt, aucune réception de
  marchandise** ; la réception d'une prestation se constate **par un statut**
  (décision B-6) ;
- **aucune taxe** (DEC-014) ; **aucune devise** autre que le KMF (DEC-010) ;
- **aucun second module « Achats »** : les quatre menus vivent sous Commerce
  (Plan 02 §7.1) ;
- **aucune résolution de P-5** (§19.3).

---

# 18. Le devis fournisseur

## 18.1 Identité

| Donnée | Règle |
| --- | --- |
| **Référence interne** | `DEV-F-2026-000001` — préfixe, année, six chiffres, remise à zéro annuelle. Le suffixe `-F` est celui de `FAC-F` : lire la référence dit de quel côté on se trouve |
| **Référence du fournisseur** | **Facultative, et distincte** — §18.2 |
| **Fournisseur** | Le fournisseur du module Tiers, **jamais recopié**. Aucune table parallèle |
| **Date de l'offre** | Obligatoire. ⚠ **Elle ne détermine aucun prix** (§19) |
| **Validité** | **Facultative**, et jamais inventée : c'est **le fournisseur** qui la fixe |
| **Devise** | KMF (DEC-010) |
| **Conditions**, **Observations** | Texte libre, repris sur le document |

## 18.2 🟥 Deux références, jamais confondues

Module 07 §30 pose déjà la règle pour la facture reçue : « le numéro de facture
fourni par le fournisseur peut également être enregistré comme référence
externe », **distinct du numéro interne**. Elle vaut ici, et c'est **la même
colonne, du même nom, avec la même contrainte**.

- le **numéro d'ADIKOM** classe l'offre chez elle ;
- la **référence du fournisseur** la retrouve chez lui — c'est elle qu'il citera
  au téléphone.

La recherche porte sur **les deux** : l'une est souvent la seule dont on dispose.

**Elle est gelée avec l'offre** (§21) : la laisser réécrivable permettrait de
faire passer une offre enregistrée pour une autre.

## 18.3 Cycle de vie

```
BROUILLON ──enregistrer──▶ REÇU ──retenir──▶ RETENU ──convertir──▶ CONVERTI
    │                       │                  │
    │                       └──écarter──▶ ÉCARTÉ│
    │                       │                  │
    └───────────────────────┴──────────────────┴──annuler──▶ ANNULÉ
```

Les **codes** sont ceux du commerce client — Plan 02 §9.5 ne crée qu'une seule
énumération, `commercial_document_status`, délibérément nommée sans préfixe de
domaine. **Seuls les libellés diffèrent**, et ils disent l'achat :

| Code | Libellé | Ce qu'il signifie | Capacité |
| --- | --- | --- | --- |
| `DRAFT` | **Brouillon** | L'offre se saisit. En-tête et lignes librement modifiables | `create` |
| `SENT` | 🟥 **Reçu** | L'offre est enregistrée **telle qu'elle a été remise**. En-tête, référence, conditions et lignes figés | `validate` |
| `ACCEPTED` | **Retenu** | ADIKOM retient cette offre | `validate` |
| `REFUSED` | **Écarté** | ADIKOM en préfère une autre. Conservé comme acte antérieur | `validate` |
| `CONVERTED` | **Converti** | Une commande en est née. **Ne se déclare pas** | `purchase_orders.create` |
| `ANNULÉ` | **Annulé** | L'enregistrement est retiré. Historisé, jamais supprimé | `cancel` |

**Pourquoi écarter relève de `validate` et non de `cancel`** : retenir et écarter
sont **le même geste** — la décision d'ADIKOM sur cette offre —, par la même
personne, sur le même écran. Annuler, c'est dire que l'enregistrement n'aurait
pas dû exister. **Une offre écartée n'est pas une offre annulée.**

**Une offre convertie revient à « retenue »** si sa commande est annulée. C'est
le seul chemin de retour, et il n'est ouvert qu'à
`commerce.purchase_orders.cancel`.

**Aucun état « expiré »** — décision B-7, comme pour le devis client : la
péremption se **calcule** de `valid_until` et du jour comorien. L'écran la
signale ; il ne décide rien.

---

# 19. 🟥 Le prix d'une ligne d'achat — et pourquoi la règle s'inverse

## 19.1 La règle

> **Sur une ligne d'achat, le prix est TOUJOURS SAISI — ligne de catalogue
> comprise. C'est le prix que CE fournisseur propose, sur CET acte.**

Côté client, le prix d'une ligne de catalogue est **résolu du catalogue** et un
prix saisi y est **refusé** : ce serait une remise déguisée, que rien ne
garderait. Côté fournisseur, la règle s'inverse — et ce n'est pas une facilité.

## 19.2 Pourquoi

`service_variant_costs` porte un coût de **référence** : **une** valeur par
variante et par date, **sans dimension fournisseur**.

Résoudre ce coût et l'imposer à la ligne ferait passer **une valeur interne pour
une offre reçue** : le devis ne dirait plus ce que le fournisseur a proposé.

```
Catalogue :   SERVICE DEMO 03 — coût de référence 45 000 KMF

Fournisseur A propose  52 000  ──▶ ligne du devis A : 52 000
Fournisseur B propose  38 000  ──▶ ligne du devis B : 38 000
Catalogue relevé à     70 000  ──▶ les deux devis restent à 52 000 et 38 000
```

## 19.3 🟥 P-5 reste ouvert, et ce lot ne le tranche pas

Le point **P-5** — « un service a-t-il un prix d'achat unique, ou un prix par
fournisseur ? » (Plan 02 §15) — **n'est pas tranché**, et le LOT 26 **n'a pas eu
besoin de le trancher** : le prix vit sur l'ACTE, non dans le référentiel.

| | Coût de **référence** | Prix **fournisseur** |
| --- | --- | --- |
| Où | `service_variant_costs` | `purchase_*_lines.unit_price` |
| Combien | **une** valeur par date | **une par offre**, par fournisseur |
| Gardé par | `catalog.services.cost.view` | `commerce.purchase_*.view` |
| Écrit par | `catalog.services.cost.update` | `commerce.purchase_quotes.create` |

🟥 **`service_variant_costs` n'a reçu ni `supplier_id`, ni aucune autre colonne.**
La migration du lot refuserait de s'appliquer si c'était le cas.

## 19.4 Le repère, et seulement un repère

L'éditeur de lignes **affiche** le coût de référence à la date du document, à
côté du champ de saisie, avec l'écart — « voici ce que nous payons d'habitude ».

- il n'est **jamais recopié** dans le champ ;
- il n'est montré qu'à qui détient **`catalog.services.cost.view`**, et l'écran
  **dit** pourquoi la case est vide quand ce n'est pas le cas (DEC-017) ;
- il **n'entre dans aucun document, aucun export, aucune ligne enregistrée**. Un
  balayage des sources documentaires **refuse jusqu'à son nom de variable**.

**Un acheteur travaille sans lui** : la recette éprouve tout le parcours avec un
profil qui ne détient pas cette capacité.

---

# 20. Les lignes — 🟩 A-13 s'applique

La question A-13, telle que le Plan 01 §23 l'a posée à la Direction, ne parle ni
du client ni du fournisseur : « **un devis / une commande** peut-il porter une
ligne libre, sans service au catalogue ? — **Oui**, `service_id` nullable ». Et
le Plan 01 §15.3–15.4 décrit les quatre tables de ce lot comme « **même
structure, symétrique** ».

**A-13 n'est donc pas étendue par ressemblance : elle était générale, et ces
tables sont celles qu'elle visait.** Aucun service « Divers » n'est créé.

| | **Ligne de catalogue** | **Ligne libre** |
| --- | --- | --- |
| Service, variante | obligatoires — **traçabilité** | aucun |
| Désignation | **copiée** du catalogue, ajustable | **saisie** |
| Prix unitaire | **saisi** (§19) | **saisi** |
| Quantité | saisie, entière (B-14) | saisie, entière |

La base garantit, exactement comme côté client : le couple service/variante va
**ensemble ou pas du tout** ; la variante **appartient bien à son service**, par
une clé étrangère **composite** et non par un déclencheur ; quantité et prix sont
des **entiers strictement positifs** ; une ligne **s'archive**, elle ne s'efface
pas (D6).

---

# 21. La commande fournisseur

## 21.1 Identité et origines

| Donnée | Règle |
| --- | --- |
| **Référence** | `CDE-F-2026-000001` |
| **Fournisseur** | Le fournisseur du module Tiers |
| **Offre d'origine** | **Facultative** |
| **Date de commande** | Obligatoire |
| **Réception attendue** | Facultative |

| Cas | Chemin |
| :-: | --- |
| **A** | Conversion d'une **offre retenue**, depuis sa fiche |
| **B** | **Création directe** — ADIKOM commande sans avoir demandé d'offre |

Le **cas B est prévu par l'architecture** : Plan 01 §15.2 écrit, pour la commande
client, « origine facultative », et §15.3–15.4 donnent aux tables fournisseurs la
même structure. C'est aussi **le cas le plus courant d'un achat de routine** :
l'interdire obligerait à saisir une offre fictive pour pouvoir commander.

## 21.2 Cycle de vie

```
BROUILLON ──passer──▶ PASSÉE ──réceptionner──▶ RÉCEPTIONNÉE
                         │                          │
                         └────────facturer──────────┴──▶ FACTURÉE
                                                          │
   (annulation de la facture)  ◀──────────────────────────┘

BROUILLON · PASSÉE · RÉCEPTIONNÉE ──annuler──▶ ANNULÉE
```

| Code | Libellé | Ce qu'il signifie | Capacité |
| --- | --- | --- | --- |
| `DRAFT` | **Brouillon** | Se prépare. Lignes modifiables | `create` |
| `CONFIRMED` | **Passée** | La commande est transmise. **Conditions et lignes figées** | `validate` |
| `DELIVERED` | 🟥 **Réceptionnée** | Prestation constatée reçue. **Aucun bon de réception** (B-6) | `validate` |
| `INVOICED` | **Facturée** | Une facture fournisseur en est née. **Ne se déclare pas** | `billing.supplier_invoices.create` |
| `CANCELLED` | **Annulée** | Historisée. Son offre d'origine redevient « retenue » | `cancel` |

**La réception n'est pas un passage obligé**, et **ce n'est pas un document**.
Plan 01 §15.5, décision B-6 : « Aucune livraison, aucun bon de livraison, aucune
réception. La réception d'une prestation est constatée par le passage de la
commande fournisseur à `DELIVERED` — un statut, pas un document. »

## 21.3 Ce qui se fige, et ce qui reste annotable

Exactement la doctrine du §7.3 bis, appliquée d'emblée : hors brouillon, le
fournisseur, l'origine, la date, le numéro, la devise **et les conditions** sont
gelés ; les **observations** restent annotables, mais **exigent
`commerce.purchase_orders.update` dans tous les états** — annoter, c'est
modifier. La même règle vaut pour l'offre, dont **la référence externe** rejoint
le gel.

---

# 22. 🟥 La facture reçue — aucun système parallèle

## 22.1 Le principe

`create_invoice_from_purchase_order` est un **orchestrateur**. Elle n'écrit
elle-même **aucune ligne** dans les tables de facturation : elle appelle les
fonctions existantes, qui portent déjà leurs cinq couches de contrôle.

```
create_invoice_from_purchase_order(commande, date, échéance, réf. fournisseur)
        │
        ├─▶ create_supplier_invoice(…)          ← EXISTANTE, non dupliquée
        │
        └─▶ add_supplier_invoice_line(…)        ← EXISTANTE, une par ligne active
                 label · quantité · prix unitaire   ← COPIÉS de la commande
                 service · variante                 ← traçabilité
                 amount = quantité × prix           ← CALCULÉ, jamais fourni
```

**La facture naît en BROUILLON.** La **soumettre au contrôle** puis la **valider**
restent des actes distincts, sous `billing.supplier_invoices.update` et
`.validate` : c'est **la validation qui reconnaît la dette**, et elle seule ouvre
l'imputation et le règlement.

Une facture née d'une commande est une `supplier_invoices` **ordinaire** : même
numérotation `FAC-F`, même écran, même cycle, **mêmes imputations**, **mêmes
règlements partiels**, **mêmes écritures de trésorerie**, même place dans le
pilotage.

## 22.2 🟥 Une facture reçue CONSTATE — elle n'exécute pas la commande

C'est l'asymétrie de fond entre les deux côtés du commerce :

| | Côté **client** | Côté **fournisseur** |
| --- | --- | --- |
| La facture | **exprime** l'engagement d'ADIKOM | **constate** ce que le tiers réclame |
| Son montant | celui de la commande, décidé par ADIKOM | celui du **document reçu** (Module 07 §28, §54) |

**Rien n'oblige donc le total de la facture à égaler celui de la commande.** Un
fournisseur peut facturer un extra, consentir un geste, livrer une quantité
différente. Les lignes sont recopiées **pour épargner une ressaisie**, et restent
modifiables tant que la facture est en saisie.

Le système les rend **comparables** — la fiche de la commande affiche les deux
totaux et leur **écart** — il ne les force pas à coïncider. Les forcer
reviendrait à **réécrire un document reçu**.

## 22.3 🟦 Une commande, au plus une facture non annulée

**La règle appliquée.** Une commande fournisseur porte **au plus une facture non
annulée**, par un index d'unicité partiel — de la même forme que côté client.

🟥 **Ce point n'est PAS tranché par symétrie avec DEC-050**, qui porte
expressément sur la commande **client**. Il est **déduit de l'architecture**, et
le raisonnement est écrit :

1. Plan 02 §9.2 ajoute `supplier_invoices.purchase_order_id` — **une** colonne,
   au singulier ;
2. `order_status` porte `INVOICED` et **aucun état partiel** — et il est
   **partagé** avec le commerce client : c'est un statut de la commande
   **entière**, des deux côtés ;
3. `create_invoice_from_purchase_order` ne sait exprimer ni sélection de lignes,
   ni quantité à facturer ;
4. là où le Plan a **voulu** plusieurs factures — la longue durée, A-6 —, il a
   créé l'objet qui les porte. Ici, rien de tel n'existe ;
5. **aucune règle documentaire** ne parle d'acompte fournisseur : Module 07,
   Règles finance §8, Règles fournisseurs §2 et Workflow 08 ont été relus.

**Ce que l'architecture impose** : si deux factures pouvaient se rattacher à une
même commande, `INVOICED` deviendrait ambigu — facturée pour quel montant ? — et
l'annulation de l'une ne saurait pas si la commande redevient « passée ».

🟥 **CE QUI N'EST PAS EMPÊCHÉ POUR AUTANT.** Un fournisseur qui facture une même
commande en deux fois **n'est pas bloqué** : la seconde facture s'enregistre
comme toute facture reçue — c'est la chaîne du LOT 5, inchangée — et cite la
commande dans ses observations. **Seul le lien structurel est unique. Aucune
dette ne disparaît, aucun paiement n'est empêché.**

> 🟥 **Question ouverte, posée à la Direction.** ADIKOM reçoit-elle, en pratique,
> **plusieurs factures pour une même commande fournisseur** — acompte puis solde ?
> Si oui, l'extension est connue et **additive**. **Aucune option n'a été choisie
> d'office** : la règle appliquée est celle que l'architecture documentée impose
> aujourd'hui. Voir le Rapport 18.

## 22.4 Colonnes ajoutées — toutes nullables

| Table | Colonne | Rôle |
| --- | --- | --- |
| `supplier_invoices` | `purchase_order_id` | La commande dont la facture est née |
| `supplier_invoice_lines` | `service_id`, `service_variant_id` | Traçabilité de l'origine |
| `supplier_invoice_lines` | `quantity`, `unit_price` | **Décomposition facultative** |

🟥 **`amount` reste l'unique source du montant brut (D1).** Plan 01 §15.5 :
« ajouter `quantity` et `unit_price` créerait deux sources du même chiffre ». La
décomposition, **quand elle existe**, est vérifiée par la base :

```sql
check ( (quantity is null and unit_price is null)
     or amount = quantity::bigint * unit_price )
```

C'est la garantie que Plan 02 §18.2 exige nommément du LOT 26. La fonction
d'ajout **calcule** `amount` et **refuse** qu'on le fournisse en même temps que
la décomposition.

**Aucune donnée existante n'est modifiée** : les factures déjà en base reçoivent
`NULL` partout. **Aucune colonne de coût de catalogue n'est ajoutée.**

## 22.5 Aucune tranche, aucun mouvement anticipé

Créer une offre, la retenir, passer une commande, préparer une facture :
**aucun** de ces actes ne meut un compte. La trésorerie ne bouge qu'au
**règlement**, par `record_supplier_payment`, inchangée. Et **une imputation
n'est jamais un paiement** (CLAUDE.md §57, DEC-013).

---

# 23. 🟥 Confidentialité — ici, `view` EST la barrière

## 23.1 Ce que le module manipule

**Des prix d'achat, et rien d'autre.** C'est ce qui le distingue du commerce
client, où le §9 pouvait écarter le coût du modèle : ici, l'objet **est** le
coût.

## 23.2 Pourquoi aucune capacité « montants » n'est créée

Un devis fournisseur ne porte rien d'autre que ce que le fournisseur demande :
**lui retirer ses montants ne laisserait qu'un nom et une date.**

Le Plan 02 §10.2 ne prévoit donc, pour ces deux menus, **aucune capacité de
montants** — contrairement aux sessions de caisse (LOT 27), où `pos.sessions.view`
répond à « **qui** était en caisse » sans dire « **combien** il y avait dedans ».
Là, la séparation ouvre quelque chose ; **ici, elle ne laisserait rien**.

🟥 **`commerce.purchase_quotes.view` et `commerce.purchase_orders.view` sont donc
marquées SENSIBLES au catalogue** — comme `catalog.services.cost.view` et
`rental.pricing.supplier.view` (Plan 02 §6, DEC-044). Ce n'est pas une capacité
de plus : c'est le **drapeau** que porte une capacité déjà prévue, et il ne change
aucun droit — il **dit** à l'écran d'attribution ce que cette attribution engage.

## 23.3 Comment la confidentialité est prouvée

🟥 **Pas par un balayage d'octets.** Le LOT 24 a établi qu'un balayage du PDF
produit **ne prouve rien** : les flux sont compressés et les polices
sous-ensemblées.

| Barrière | Nature | Où elle est éprouvée |
| :-: | --- | --- |
| 1 | **RLS** — un profil sans capacité d'achat n'obtient **aucune ligne**, par écran comme par appel direct | Recette de production |
| 2 | **Fonctions** — `purchase_quote_total` est `SECURITY INVOKER` : elle rend 0 à qui ne lit pas les lignes | Recette de production |
| 3 | **Documents** — les trois modes (aperçu, téléchargement, impression) sont refusés, chacun sous **sa** capacité (DEC-024) | Recette de production |
| 4 | **Exports** — un export n'est **jamais plus permissif que l'écran** : il exige `view` **et** `export` | Recette de production |
| 5 | **Journal** — l'avant/après d'un événement d'achat exige la capacité de **son menu** (DEC-038) | Recette SQL |
| 6 | **Anti-vacuité** — un profil autorisé lit **réellement** ces montants, sans quoi les cinq barrières ne prouveraient rien | Recette de production |

## 23.4 🟥 Le document destiné au fournisseur n'est pas une fuite

| Pièce | Destination | Ce qu'elle porte |
| --- | --- | --- |
| **Devis fournisseur** | **interne** | L'offre reçue, telle qu'enregistrée |
| **Bon de commande** | **le fournisseur** | Le prix convenu **avec lui** |

Un bon de commande **doit** dire le prix convenu : c'est ce que le fournisseur
lit pour l'honorer. **La confidentialité ne consiste pas ici à taire des
montants**, mais à ce que la pièce n'existe que pour qui détient `download` ou
`print`, chacune distincte de `view`.

🟥 **Ce qui n'a jamais sa place sur une pièce d'achat, en revanche, c'est le coût
de RÉFÉRENCE du catalogue** : l'imprimer apprendrait au fournisseur ce qu'ADIKOM
paie ailleurs. Le balayage des sources documentaires **refuse ce terme jusque
dans le nom d'une variable**.

Et, symétriquement : **aucune pièce remise à un client ne porte de coût d'achat**
(§9, Plan 02 §6.4). Les deux domaines sont deux tables, deux jeux de capacités.

---

# 24. Capacités — 16, et pas une de plus

Module `commerce`, **le même**, ordre **11**. Deux menus de plus :
`purchase_quotes` (3), `purchase_orders` (4) — Plan 01 §17.2. Huit actions
chacun.

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `commerce.purchase_quotes.view` | VIEW | **✓** | Consulter les devis fournisseurs et leurs prix d'achat |
| `commerce.purchase_quotes.create` | CREATE | | Enregistrer un devis fournisseur |
| `commerce.purchase_quotes.update` | UPDATE | | Modifier un devis fournisseur |
| `commerce.purchase_quotes.validate` | VALIDATE | | Enregistrer l'offre reçue, la retenir ou l'écarter |
| `commerce.purchase_quotes.cancel` | CANCEL | | Annuler un devis fournisseur |
| `commerce.purchase_quotes.export` | EXPORT | ✓ | Exporter la liste |
| `commerce.purchase_quotes.download` | DOWNLOAD | ✓ | Télécharger le document |
| `commerce.purchase_quotes.print` | PRINT | ✓ | Imprimer le document |
| `commerce.purchase_orders.view` | VIEW | **✓** | Consulter les commandes fournisseurs et leurs prix d'achat |
| `commerce.purchase_orders.create` | CREATE | | Créer une commande, **convertir un devis** |
| `commerce.purchase_orders.update` | UPDATE | | Modifier une commande fournisseur |
| `commerce.purchase_orders.validate` | VALIDATE | | Passer une commande, constater sa réception |
| `commerce.purchase_orders.cancel` | CANCEL | | Annuler une commande fournisseur |
| `commerce.purchase_orders.export` | EXPORT | ✓ | Exporter la liste |
| `commerce.purchase_orders.download` | DOWNLOAD | ✓ | Télécharger le document |
| `commerce.purchase_orders.print` | PRINT | ✓ | Imprimer le document |

**Catalogue : 213 → 229.**

## 24.1 Ce qui n'est **pas** créé

| Non créé | Raison |
| --- | --- |
| `commerce.purchase_*.invoice` | Enregistrer la facture d'une commande relève de `billing.supplier_invoices.create`, qui existe depuis la migration 007 |
| `commerce.purchase_*.convert` | Convertir une offre, c'est **créer une commande** |
| `commerce.purchase_*.amounts.view` | Un devis fournisseur **est** un prix d'achat (§23.2) |
| `commerce.purchase_*.discount`, `.margin`, `.cost` | Aucune remise, aucune marge, aucun coût de catalogue |
| `catalog.products.*`, stock, réception | La partie Produits n'existe pas |

## 24.2 Capacités exigées par les actes composés

| Acte | Capacités exigées |
| --- | --- |
| **Enregistrer une offre** | `purchase_quotes.create` + `.view` + `parties.suppliers.view` |
| **Ajouter une ligne de catalogue** | `purchase_quotes.create` **ou** `.update`, + `.view`, + `catalog.services.view` |
| **Convertir une offre** | `purchase_orders.create` + `.view` + `purchase_quotes.view` + `parties.suppliers.view` |
| **Enregistrer la facture** | `purchase_orders.view` + `billing.supplier_invoices.create` + `.view` + `parties.suppliers.view`. **Ni `submit`, ni `validate`** : reconnaître la dette reste un acte distinct |
| **Annuler la facture d'une commande** | `billing.supplier_invoices.cancel` + `.view` + `billing.imputations.view` + `billing.supplier_payments.view` + `purchase_orders.view` |
| **Voir le repère de coût du catalogue** | `catalog.services.cost.view` — et elle seule |

## 24.3 Étanchéité

**Consulter les devis fournisseurs n'ouvre pas les commandes**, et réciproquement
— ni les deux menus du commerce **client**. Ce sont **quatre menus, quatre
capacités** (A-14). Une fiche d'offre convertie dont le lecteur n'a pas
`commerce.purchase_orders.view` **dit** que la commande existe et que sa
référence ne lui est pas communiquée (DEC-017).

---

# 25. Documents, audit, sauvegarde

## 25.1 Documents

Deux pièces, produites par l'**architecture documentaire existante** —
`DocumentShell`, charte ADIKOM, logo officiel, pagination, blocs partagés. Aucun
second moteur PDF.

| Document | Type | Capacités |
| --- | --- | --- |
| **Devis fournisseur** | `devis-fournisseurs` | `purchase_quotes.view` + `.download` / `.print` |
| **Bon de commande fournisseur** | `commandes-fournisseurs` | `purchase_orders.view` + `.download` / `.print` |

Le bon de commande porte **les deux références** — celle d'ADIKOM et celle du
fournisseur — parce que **le numéro d'ADIKOM ne dit rien chez lui**.

Ce qu'ils ne portent jamais : **aucun coût de référence du catalogue**, **aucune
marge**, **aucune nature de ligne** (catalogue ou libre regarde ADIKOM), **aucune
mention de créance** — ni une offre ni une commande n'appelle de règlement.

## 25.2 Audit

| Acte | Type | Module |
| --- | --- | --- |
| Enregistrement d'une offre, d'une commande | `CREATE` | `commerce` |
| Modification d'un en-tête, d'une ligne | `UPDATE` | `commerce` |
| Enregistrement, décision, annulation | `STATUS_CHANGE` | `commerce` |
| Conversion en commande | `STATUS_CHANGE` + `CREATE` | `commerce` |
| Passage, réception | `STATUS_CHANGE` | `commerce` |
| Enregistrement de la facture | `CREATE` | `billing` |
| Téléchargement, impression, export | `DOWNLOAD` / `PRINT` / `EXPORT` | `commerce` |
| Refus d'accès à un document | `ACCESS_DENIED` | `commerce` |

🟥 **Le journal n'ouvre pas ce que la table ferme** (DEC-038) — et ici, l'enjeu
est un **prix d'achat** : l'avant/après d'un événement d'offre exige
`commerce.purchase_quotes.view` ; celui d'une commande,
`commerce.purchase_orders.view`.

## 25.3 Sauvegarde

Les quatre tables entrent au périmètre, **entre le commerce client et le cycle
d'exploitation** :

```
… sales_quotes, sales_quote_lines, sales_orders, sales_order_lines,
  purchase_quotes, purchase_quote_lines, purchase_orders, purchase_order_lines,
  reservations, rentals, … supplier_invoices, supplier_invoice_lines, …
```

**58 → 62 tables.** L'ordre est impératif : une ligne de commande cite la ligne
d'offre dont elle est née, et une facture fournisseur cite sa commande.

---

# 26. Limites et points ouverts — commerce fournisseur

| # | Point | Nature |
| :-: | --- | --- |
| 1 | **Plusieurs factures pour une même commande** — acompte puis solde | 🟥 **Question posée à la Direction** (§22.3). La règle appliquée est celle que l'architecture impose ; rien n'est perdu entre-temps |
| 2 | **Prix d'achat par fournisseur au catalogue** — P-5 | 🟥 **Ouvert, et intact** (§19.3). Le lot fonctionne sans le trancher |
| 3 | **Remises consenties par un fournisseur** | 🟦 Non modélisées. DEC-051 porte sur les remises **clients** ; rien n'a été validé pour l'achat (§17.3) |
| 4 | **Traçabilité ligne à ligne de la facture** | 🟦 Plan 02 §9.2 énumère **quatre** colonnes pour `supplier_invoice_lines`, sans `source_order_line_id`. L'origine est portée par l'en-tête |
| 5 | **Référence du fournisseur sur une commande directe** | 🟦 Non prévue : la commande directe n'a pas d'offre, donc pas de référence externe. Elle peut être consignée en observations |
| 6 | **Convention définitive des références** | 🟦 DEC-023 §5 — `DEV-F` / `CDE-F` restent provisoires, comme `FAC-F` |
| 7 | **Produits, stock, réception physique** | 🟦 Non développés. Le modèle de ligne les accueillera par le même couple de colonnes nullables |

---

**ADIKOM PILOT — Module 11 : Commerce**
**LOT 25 · DEC-049 · Commerce client — LOT 26 · DEC-052 · Commerce fournisseur**
