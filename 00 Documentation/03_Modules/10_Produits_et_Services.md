# ADIKOM PILOT

## Module 10 — Produits & Services

**Version :** 1.0
**Statut :** Document de référence fonctionnelle
**Entreprise :** ADIKOM Technology & Travel
**Projet :** ADIKOM PILOT
**Périmètre :** LOT 20 — **Services uniquement**
**Sources :** `RAPPORTS/Plan 02` §4.4, §5, §7.4, §9, §10.2 · décisions Direction A-2, A-8, A-14 · DEC-043

---

# 1. Objet du module

Le module **Produits & Services** enregistre le catalogue des prestations
qu'ADIKOM **vend**, **achète**, ou les deux.

Il ne vend rien lui-même, ne facture rien et n'encaisse rien. Il constitue le
**socle** que consommeront les devis, les commandes, la facturation et le point
de vente — chacun dans son propre lot.

## 1.1 Ce que le LOT 20 livre

- les **catégories de services** ;
- les **services** et leur destination (achat, vente, les deux) ;
- les **variantes** d'un service ;
- les **versions datées** du prix de vente ;
- les **versions datées** du prix d'achat, sous leur propre capacité ;
- les **résolveurs** qui répondent à « quel prix s'applique à cette date ? ».

## 1.2 Ce que le LOT 20 ne livre pas

- **aucun produit** : la partie Produits est nommée, elle n'est pas développée
  (§2) ;
- **aucun stock**, aucun entrepôt, aucun mouvement, aucune valorisation ;
- **aucune ligne de devis, de commande, de facture ou de vente** ;
- **aucun calcul de rentabilité globale** : la marge est *calculable* à partir
  des données historisées, elle n'est pas un écran de ce module (§9.4).

---

# 2. Produits — nommés, non développés

🟩 **Décision de la Direction, reprise du Plan 02 §4.4.** Le module s'appelle
**« Produits & Services »** et son code technique est `catalog` — choisir le nom
large maintenant évite de renommer un module après attribution de ses capacités.

**Trois conséquences, à tenir :**

1. **Aucune table de produit** n'est créée.
2. **Aucune capacité `catalog.products.*`** n'est créée : une permission qui ne
   débloque rien ne s'attribue pas (`CLAUDE.md` §19 bis, DEC-042 §d).
3. **Aucune entrée de navigation « à venir »** : le projet les a toutes retirées
   (DEC-042 §d) et n'en réintroduit pas. Une entrée inerte promet ce que l'écran
   ne fait pas.

La section Produits existe donc **dans le nom du module et dans ce document**,
et nulle part ailleurs.

---

# 3. Catégories de services

Une catégorie classe les services : *Transport*, *Excursion*, *Assistance*,
*Services techniques*…

| Information | Règle |
| --- | --- |
| **Code** | Court, stable, unique. C'est la référence de classement |
| **Libellé** | Unique, insensible à la casse |
| **Description** | Facultative |
| **Ordre d'affichage** | Facultatif, pour présenter le catalogue dans l'ordre d'ADIKOM |
| **État** | **Active** ou **Archivée** |
| **Auteur et dates** | Créée par / le, modifiée par / le — comme partout ailleurs |

## 3.1 Archivage

Une catégorie **ne se supprime jamais** : elle s'archive (`CLAUDE.md` §22). Des
services, et par eux des opérations passées, y font référence.

> **Une catégorie archivée n'est plus proposée à la création d'un service.**

Elle reste visible dans la liste des catégories — pour pouvoir la réactiver — et
sur la fiche des services qui la portent déjà. Un service existant **n'est pas
déclassé** parce que sa catégorie a été archivée : sa fiche indique que la
catégorie ne l'est plus.

---

# 4. Service

| Information | Règle |
| --- | --- |
| **Référence** | `SRV-000001`, produite par la base (DEC-005). Jamais saisie |
| **Libellé** | Obligatoire. Unique au sein d'une catégorie, hors services archivés |
| **Catégorie** | Obligatoire, et **active** au moment de la création |
| **Destination** | `ACHAT` · `VENTE` · `ACHAT ET VENTE` — **explicite** (§5) |
| **Unité d'exploitation** | Facultative : « trajet », « journée », « personne »… Information d'exploitation, sans effet sur le calcul |
| **Description** | Facultative — ce que la prestation couvre |
| **Notes** | Facultatives — usage interne |
| **Statut** | **Actif** · **Inactif** · **Archivé** |

## 4.1 Les trois statuts, et ce qu'ils veulent dire

| Statut | Sens |
| --- | --- |
| **Actif** | Le service est proposable |
| **Inactif** | Suspendu temporairement. Il reste au catalogue, ses prix vivent, il n'est pas proposé |
| **Archivé** | Retiré du catalogue. Aucune reprise n'est prévue ; l'historique reste |

Un service **ne se supprime jamais.**

## 4.2 Toute création produit une variante

> **Tout service reçoit à sa création une variante « Standard », marquée par
> défaut.**

Il n'existe donc **jamais** de service sans variante, et aucun des modules à
venir n'a de cas particulier à traiter : une ligne de devis, de commande, de
facture ou de vente désignera toujours une variante précise.

---

# 5. Destination — achat, vente, ou les deux

🟩 **La destination est une donnée enregistrée, jamais déduite.**

Un service n'est pas « vendable parce qu'il porte un prix de vente » : il porte
un prix de vente **parce qu'il est destiné à la vente**. L'ordre inverse ferait
d'une saisie une décision commerciale.

| Destination | Prix de vente | Prix d'achat |
| --- | :-: | :-: |
| **VENTE** | Autorisé | **Refusé par la base** |
| **ACHAT** | **Refusé par la base** | Autorisé |
| **ACHAT ET VENTE** | Autorisé | Autorisé |

**Aucun des deux n'est obligatoire.** Un service peut exister sans prix : il
n'est alors simplement pas utilisable, et l'écran le dit (§9.3). C'est un refus
explicite, jamais un montant nul supposé (DEC-008).

## 5.1 Changer la destination d'un service

Le changement est possible **tant qu'il ne contredit pas ce qui existe** :

- passer à **VENTE** exige qu'**aucune version de prix d'achat active** ne
  subsiste ;
- passer à **ACHAT** exige qu'**aucune version de prix de vente active** ne
  subsiste ;
- passer à **ACHAT ET VENTE** est toujours possible.

Le contrôle est porté par la **base**, et il compte la vérité — non ce que
l'utilisateur a le droit de voir (§10.3). Un lecteur sans accès aux coûts ne
peut donc pas, en les ignorant, rendre un service « vente seule » alors que des
coûts y vivent encore.

---

# 6. Variantes

Un même service se décline. Le service ne se duplique pas : il reçoit des
variantes.

```
Service     « Transfert aéroport »
     ├── Standard   (par défaut)
     ├── Premium
     └── VIP
```

| Information | Règle |
| --- | --- |
| **Libellé** | Obligatoire. Unique au sein du service |
| **Référence (SKU)** | Facultative. Unique dans tout le catalogue lorsqu'elle est renseignée |
| **Par défaut** | **Une seule** variante par défaut et par service |
| **Active / inactive** | Une variante retirée de l'offre reste au catalogue |
| **Ordre d'affichage** | Facultatif |

**Chaque variante porte ses propres prix.** C'est la variante, jamais le
service, qui est tarifée.

Une variante **ne se supprime jamais** : elle se désactive.

---

# 7. Prix de vente — des versions datées

## 7.1 La règle — DEC-043, doctrine D16

> **Un prix est une ligne datée ; une opération en garde la copie.**
>
> Changer un prix, c'est **clore la version courante et en ouvrir une
> nouvelle** — jamais réécrire une colonne.

```
TRANSFERT AÉROPORT · Standard

  01/01/2026 → 30/06/2026      50 000 KMF
  01/07/2026 → …               60 000 KMF

  Prestation du 15/06   →  50 000 KMF
  Prestation du 15/07   →  60 000 KMF
```

## 7.2 Ce que cela permet, et que « le prix du jour » ne permettait pas

| Besoin | Pourquoi une seule colonne ne suffit pas |
| --- | --- |
| **Préparer un prix futur** | « À partir du 1ᵉʳ juillet, ce sera 60 000 » doit pouvoir être saisi le 20 juin. Sans versions, il faudrait y penser le 1ᵉʳ juillet au matin |
| **Tarifer une saisie rétroactive** | Une prestation rendue le 15/06 et saisie le 20/07 doit prendre **50 000**, pas 60 000 |
| **Expliquer un montant** | « Sur quelle version ce montant repose-t-il ? » doit avoir une réponse exploitable. Le journal d'audit dit *qui* a décidé ; il n'est pas une structure de calcul |

## 7.3 Contenu d'une version

| Champ | Règle |
| --- | --- |
| **Montant** | Entier, en **KMF**, strictement positif (DEC-010) |
| **Date de début** | Obligatoire. **Une date future est autorisée** — c'est le besoin |
| **Date de fin** | Facultative. Vide = en vigueur, sans terme |
| **Active** | Une version se désactive ; elle ne se supprime pas |
| **Motif** | Facultatif — pourquoi le prix change |
| **Auteur et dates** | Enregistrés |

## 7.4 Deux règles que la base impose

1. **Aucun chevauchement** entre deux versions **actives** de la même variante.
   La contrainte est portée par la base et non par un contrôle applicatif :
   elle ferme aussi la **course entre deux saisies simultanées**, qu'aucun
   contrôle applicatif ne voit.
2. **Un trou entre deux versions est permis**, et il signifie « aucun prix à
   cette date ». Le résolveur ne renvoie alors rien, et l'écran le dit.

## 7.5 Corriger un prix

- **Changer un prix** = ouvrir une nouvelle version à la date d'effet voulue. La
  version courante est close la veille, automatiquement.
- **Retirer un prix saisi par erreur** = **désactiver** la version. Elle reste
  lisible, avec son auteur et son motif.
- **Aucune version ne se supprime**, et **aucune ne se réécrit** : corriger une
  version passée ne modifie jamais une opération déjà enregistrée, laquelle
  portera sa propre copie.

---

# 8. Prix d'achat — le même mécanisme, une confidentialité en plus

Le **coût** d'un service est une donnée **sensible**. Il obéit exactement aux
règles du §7 — versions datées, aucun chevauchement, aucune suppression — et
s'y ajoute la confidentialité.

## 8.1 Pourquoi une table séparée, et non une colonne

RLS protège des **lignes**, pas des **colonnes**. Un coût rangé à côté du
libellé serait lu par quiconque a le droit de lire le service, y compris par un
appel direct à l'API. La séparation n'est donc pas une préférence de
modélisation : c'est **la seule construction qui rende la règle applicable au
niveau de la donnée**. Le précédent est celui des coûts de maintenance
(`maintenance_costs`, DEC-024).

## 8.2 Qui voit quoi

| Capacité | Ouvre |
| --- | --- |
| `catalog.services.view` | Le service, ses variantes, ses **prix de vente** |
| `catalog.services.cost.view` | Les **prix d'achat**, et eux seuls |
| `catalog.services.cost.update` | La **saisie** d'un prix d'achat |

Un utilisateur qui vend un service **ne voit pas ce qu'il a coûté**, sauf s'il
en a reçu le droit. L'écran le **dit** plutôt que de le taire : un bloc absent
est nommé (DEC-017).

## 8.3 🟥 Point ouvert — P-5 : un coût, ou un coût par fournisseur ?

Le Plan 02 §3.7 pose la question, **et aucune décision de la Direction n'y
répond** :

> « Le prix d'achat d'un service est-il **unique**, ou peut-il **varier selon le
> fournisseur** ? »

**Ce que le LOT 20 fait** : il enregistre **un coût par variante et par
période**, sans portée fournisseur. C'est la lecture la plus simple, et la seule
qui n'invente rien.

**Ce que le LOT 20 se garde de faire** : il ne rend pas cette évolution
impossible. Le jour où la Direction répondra « par fournisseur », l'ajout est
additif — une colonne `supplier_id` **nullable** sur les versions de coût, et la
contrainte d'unicité étendue à cette colonne. Les versions déjà saisies
signifieront alors « coût sans fournisseur désigné », ce qui est exact.

**Aucune règle métier n'a été inventée pour combler ce vide** (`CLAUDE.md` §55).

---

# 9. Marge — ce qui est possible, et ce qui n'est pas fait

## 9.1 Ce que le LOT 20 rend calculable

```
Marge unitaire d'une variante à une date D
    = prix de vente applicable à D  −  prix d'achat applicable à D
```

Les deux termes sont **résolus à une date**, jamais lus « au dernier prix
connu ».

## 9.2 Ce que le LOT 20 ne fait pas

- **aucune marge stockée** : une différence se recalcule, elle ne se conserve
  pas (doctrine D1) ;
- **aucun écran de rentabilité**, aucun agrégat, aucun taux moyen. La
  rentabilité commerciale relève des lots qui porteront les opérations ;
- **aucune moyenne entre variantes** : elle mélangerait des volumes inconnus.

## 9.3 Les cas où la marge n'est pas calculée — et l'écran le dit

| Cas | Traitement |
| --- | --- |
| Pas de prix d'achat à cette date | Marge **non calculée**. Un coût nul ferait passer la marge pour 100 % du prix |
| Pas de prix de vente à cette date | Marge non calculée |
| Destination **ACHAT** seule | Aucune marge : un service acheté et consommé n'en produit pas |
| Destination **VENTE** seule | Aucune marge : il n'y a pas de coût à opposer |
| Lecteur sans `catalog.services.cost.view` | **Ni le coût, ni la marge.** Et l'écran **nomme** ce qu'il ne montre pas (DEC-017) |

## 9.4 Prix, coût, marge — jamais confondus

Trois grandeurs, trois noms, trois capacités. Le module ne présente jamais un
coût comme un prix, ni une marge comme un résultat.

---

# 10. Permissions

## 10.1 Les douze capacités du module

| Code | Action | Sensible | Ce qu'elle ouvre |
| --- | --- | :-: | --- |
| `catalog.services.view` | VIEW | | Consulter les services, variantes et **prix de vente** |
| `catalog.services.create` | CREATE | | Créer un service |
| `catalog.services.update` | UPDATE | | Modifier un service et ses variantes |
| `catalog.services.archive` | ARCHIVE | | Activer / désactiver / archiver un service |
| `catalog.services.export` | EXPORT | ✓ | Exporter la liste des services |
| `catalog.services.price.update` | UPDATE | ✓ | **Modifier les prix de vente** |
| `catalog.services.cost.view` | VIEW | ✓ | **Voir les prix d'achat** |
| `catalog.services.cost.update` | UPDATE | ✓ | **Saisir les prix d'achat** |
| `catalog.categories.view` | VIEW | | Consulter les catégories |
| `catalog.categories.create` | CREATE | | Créer une catégorie |
| `catalog.categories.update` | UPDATE | | Modifier une catégorie |
| `catalog.categories.archive` | ARCHIVE | | Activer / désactiver une catégorie |

## 10.2 Ce qui n'est pas créé, et pourquoi

| Non créé | Raison |
| --- | --- |
| `catalog.products.*` | La partie Produits n'existe pas (§2) |
| `catalog.services.price.history.view` | L'historique de vente ne montre rien de plus que `catalog.services.view` n'ouvre déjà, et l'historique d'achat vit dans une table déjà gardée par `catalog.services.cost.view`. Une capacité de plus **ne fermerait rien** |
| `catalog.services.margin.view` | Une marge est la différence de deux grandeurs **déjà gouvernées** |
| `catalog.services.delete` | Rien ne se supprime |
| `catalog.categories.export` | Aucun export de catégories n'est livré |
| `catalog.*.download` / `.print` | Aucun document n'est produit par ce module |

## 10.3 Ce qu'une capacité de prix n'ouvre pas

- `catalog.services.update` **n'ouvre pas** `price.update` : corriger une
  description et changer un prix ne sont pas le même geste. Le précédent est
  `parties.clients.pricing.manage`, distincte de `parties.clients.update`.
- `catalog.services.price.update` **n'ouvre pas** `cost.view` : fixer un prix de
  vente n'a jamais supposé de connaître le coût.
- `catalog.services.cost.update` **suppose** `catalog.services.view`, et
  l'**exige explicitement** : une écriture sous RLS lit d'abord les lignes
  qu'elle vise, et sans droit de lecture elle ne modifierait rien **sans rien
  dire**. La capacité est donc demandée, puis **l'effet est vérifié**.

---

# 11. Sécurité

## 11.1 Trois couches, comme partout

| Couche | Ce qu'elle tient |
| --- | --- |
| **Interface** | Confort de lecture. **Jamais une protection** |
| **Action serveur** | La capacité correspondant à l'acte demandé |
| **Base — RLS et déclencheurs** | La dernière barrière, y compris pour un appel direct à l'API |

## 11.2 Les garanties éprouvées

- un compte sans `catalog.services.view` **n'atteint pas** l'écran des services ;
- un compte sans `catalog.services.cost.view` **n'obtient aucun coût** : ni à
  l'écran, ni par export, ni par appel direct à l'API, ni par le résolveur de
  coût — qui ne lui renvoie **aucune ligne** ;
- un compte sans `catalog.services.price.update` **ne modifie aucun prix**, même
  s'il peut modifier le service ;
- un compte porteur d'`catalog.services.update` **ne saisit aucun coût** ;
- le **journal d'activité** n'ouvre le détail d'une version de coût qu'à qui
  détient `catalog.services.cost.view` : `users.audit.view` donne l'événement,
  pas la donnée (DEC-038).

---

# 12. Audit

Sont journalisés :

| Acte | Type d'événement |
| --- | --- |
| Création, modification, archivage d'une **catégorie** | `CREATE` · `UPDATE` · `STATUS_CHANGE` |
| Création, modification d'un **service** | `CREATE` · `UPDATE` |
| Changement de **statut** d'un service | `STATUS_CHANGE` |
| Création, modification d'une **variante** | `CREATE` · `UPDATE` |
| Toute écriture d'une version de **prix de vente** | **`PRICE_CHANGE`** |
| Toute écriture d'une version de **prix d'achat** | **`PRICE_CHANGE`** |

**L'historisation ne remplace pas l'audit.** La table de versions dit **quel
prix s'applique** ; le journal dit **qui l'a décidé, quand, et pourquoi**. Deux
questions, deux réponses, aucun doublon.

**Et le journal ne contourne pas la confidentialité** : le détail avant/après
d'une version de coût exige `catalog.services.cost.view`.

---

# 13. Sauvegarde, réinitialisation, restauration

Les cinq tables du module entrent dans le périmètre de sauvegarde, **des parents
vers les enfants** :

```
service_categories → services → service_variants
                                     ├── service_variant_prices
                                     └── service_variant_costs
```

Une table absente de ce périmètre ne serait ni exportée, ni réinitialisée, ni
restaurée — et référencerait, après restauration, des lignes disparues.

Une sauvegarde est produite avec la clé de service : elle contient donc les
coûts. **Cela ne les rend pas lisibles pour autant** — la lecture applicative
reste gardée par `catalog.services.cost.view`, restauration comprise.

---

# 14. Ce que ce module n'est pas

- **ce n'est pas un catalogue public** : ADIKOM PILOT est un SaaS interne ;
- **ce n'est pas un module de stock** ;
- **ce n'est pas un module de vente** : aucune opération commerciale n'y naît ;
- **ce n'est pas un module de rentabilité** : il rend la marge *calculable*, il
  ne la calcule pas pour l'entreprise.

---

**ADIKOM PILOT — Module 10 · Produits & Services**

> Un prix est une ligne datée.
> Un coût n'est pas un prix.
> Une destination se déclare, elle ne se devine pas.
