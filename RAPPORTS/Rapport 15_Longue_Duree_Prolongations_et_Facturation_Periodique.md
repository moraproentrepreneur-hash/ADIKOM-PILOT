# Rapport 15 — Longue durée, prolongations et facturation périodique

## LOT 23 · Module 05 « Gestion de location » × Module 07 « Facturation » — Un contrat, plusieurs factures, jamais deux sur la même période

| | |
| --- | --- |
| Date | **22 septembre 2026** |
| Lot | **LOT 23** du `Plan 02` — 5ᵉ des dix lots |
| Décision | **DEC-047** — consignée au journal |
| Sources métier | Direction, 11/09/2026 — **A-4**, **A-5**, **A-6**, **A-7**, **A-14** |
| Commit | **`04ea1a5`** |
| SHA **éprouvé et déployé** | **`04ea1a5`** — déploiement Vercel `READY` |
| Production | https://adikom-pilot.vercel.app |
| Catalogue | **196 → 197 capacités** |
| Sauvegarde | **53 → 54 tables** |
| Migrations | 93 → **96** |

---

# 1. Objectif

Le SaaS savait facturer une location **une fois**, à la fin. Il ne savait pas
facturer un contrat qui dure trois mois.

Le besoin, écrit par la Direction :

> **A-6 — « Chaque fin du mois, on établit une facture, toutefois le client peut
> exiger une facture globale de toute la période de location avec les détails et
> les historiques de payement. »**

Deux cases cochées : **mensuelle**, et **par période définie au contrat**.

Et une règle qui commande tout le reste, déjà appliquée au LOT 22 :

> **A-4 — « On garde le même contrat et on rajoute des avenants. »**

Elle vaut aussi pour la prolongation. Le LOT 22 l'avait explicitement refusée en
nommant le LOT 23 ; le refus est levé ici.

---

# 2. Décisions de la Direction appliquées

| Réf. | Ce que la Direction a décidé | Ce que le lot en fait |
| :-: | --- | --- |
| **A-6** | Facturation mensuelle **et** par période contractuelle | Les **deux** cadences, et **aucune autre**. Une facture par période, jamais deux sur le même intervalle |
| **A-6** | « … toutefois une facture globale avec les détails et les historiques de payement » | 🟥 **C'est un RELEVÉ, pas une facture** (§5). Le lot prépare la donnée et le **dit à l'écran** ; le document relève du LOT 24 |
| **A-4** | « On garde le même contrat et on rajoute des avenants » | La prolongation **devient un avenant** `AVN-…`, numéroté, daté, motivé. Aucun contrat créé, aucune période antérieure réécrite |
| **A-5** | « Le client paie le nouveau tarif » ✓ · « décision au cas par cas » ✓ | À la prolongation : tarif **conservé** par défaut ; **nouveau tarif** sous `rental.pricing.override` avec raison écrite, et **seulement pour le temps ajouté** |
| **A-7** | Pénalités de 20 à 100 % | 🟥 **Toujours pas tranchée.** Aucun barème, aucun pourcentage, aucune capacité de pénalité (§12.1) |
| **A-14** | Permissions indépendantes par action | `extend` n'ouvre pas `override` ; ni l'un ni l'autre n'ouvre le régime de facturation. Éprouvé **dans les deux sens** |

---

# 3. Périmètre

## 3.1 Ce que le lot livre

- une table — **`rental_billing_periods`** ;
- deux colonnes sur `rentals` : **`rental_type`** et **`billing_cadence`**,
  cohérentes entre elles par contrainte ;
- une colonne sur `customer_invoices` : **`billing_period_id`** ;
- **le remplacement de l'index d'unicité des factures**, dans l'ordre exact du
  Plan 02 §19.3 — l'obstacle nommé depuis le Plan 01 ;
- trois **actes** — définir le régime, annuler une période, facturer une période ;
- la **prolongation par avenant**, avec ou sans changement de tarif ;
- l'onglet **Facturation** d'un contrat ;
- la **période facturée** sur la facture, à l'écran **et sur le PDF** ;
- **une** capacité nouvelle, et pas une de plus ;
- la sauvegarde, le journal, le jeu de démonstration, les recettes.

## 3.2 Ce que le lot ne livre pas

❌ relevé / synthèse de location · ❌ pénalités · ❌ barème de durée facturable ·
❌ devis et commandes · ❌ PDV · ❌ facturation des services ·
❌ résolution de P-2 · ❌ résolution de P-5 ·
❌ contrainte d'exclusion sur `pricing_rules`

**Et aucun second système** : ni seconde numérotation, ni seconde logique de
règlement, ni seconde trésorerie. `customer_invoices` reste l'unique facture
client, et *imputation fournisseur ≠ paiement fournisseur* reste entier.

---

# 4. Architecture

## 4.1 Deux découpages qui se croisent sans coïncider

C'est le point de conception du lot, et la consigne §6 l'exigeait mot pour mot.

```
SEGMENT              un véhicule, une période, UN TARIF VERROUILLÉ.
(rental_segments)    Il se coupe quand le véhicule change ou que le tarif
    LOT 22           change. C'est L'HISTOIRE DE L'EXPLOITATION.

PÉRIODE FACTURABLE   un intervalle qu'UNE facture couvre, et une seule.
(rental_billing_…)   Elle se coupe à la FIN DU MOIS, ou aux bornes du
    LOT 23           contrat. C'est LE DÉCOUPAGE DE LA CRÉANCE.
```

Une période facturable d'octobre peut traverser **deux segments** — véhicule A
jusqu'au 12, véhicule B ensuite — et sa facture porte alors **deux lignes**, une
par portion tarifaire, au tarif verrouillé de **son** segment.

**Les tarifs ne se moyennent pas, et l'histoire n'est jamais réécrite pour
simplifier une facture.**

## 4.2 Ce que la base garantit seule

| Garantie | Comment |
| --- | --- |
| Deux périodes d'un contrat **ne se recouvrent pas** | `exclude using gist (rental_id, period) where status <> 'CANCELLED'` |
| **Aucun trou** : aucun intervalle hors facturation | Contrôle de contiguïté : `lower(new) = upper(précédente)` |
| **Une facture par période**, annulées exclues | `customer_invoices_one_per_period_idx` |
| **Une facture par location à durée fixée** | `customer_invoices_one_per_fixed_rental_idx` |
| Les deux régimes sont **étanches** | Les deux index sont **disjoints**, et `fn_customer_invoice_coherence` refuse le croisement |
| Une période **non échue** ne se facture pas | `upper(period) > now()` refusé |
| Une période **annulée** ne se facture pas, et ne se rouvre pas | `fn_rental_billing_period_guard` |
| Une période **facturée** ne se raccourcit ni ne s'annule | idem, et le refus **nomme la facture** |
| Une période **ne réécrit** ni son contrat, ni son rang, ni son origine, ni son début | idem |
| Une période mensuelle **s'achève à la fin du mois comorien** | idem, `at time zone 'Indian/Comoro'` |
| Une longue durée porte **toujours** sa cadence | `rentals_billing_cadence_coherent` |
| Rien ne se **supprime** | `fn_forbid_delete`, `DELETE` et `TRUNCATE` retirés |

## 4.3 Le lien facture ↔ période vit sur la facture, et là seulement

`customer_invoices.billing_period_id` — **pas de colonne inverse.**

Parce que c'est la facture qui s'annule. Une colonne `invoice_id` sur la période
devrait être remise à `null` à chaque annulation, et un oubli laisserait une
période réputée facturée par une facture annulée — **sans qu'aucune erreur ne
soit levée**. Le sens unique rend l'oubli impossible : l'index partiel ignore les
factures annulées, et la période redevient facturable **du seul fait** de
l'annulation. La recette l'éprouve.

## 4.4 L'état d'une période se déduit, il ne se stocke pas

La base ne stocke que **deux** états : `PLANNED` et `CANCELLED`.

« À venir », « Facturable », « Facture en brouillon » et « Facturée » sont des
**lectures**, déduites de la période et de la facture qui la couvre. Les stocker
créerait une seconde vérité qu'une annulation de facture ou le simple passage du
temps ferait diverger — exactement ce que `customer_invoices_overdue_is_derived`
interdit depuis le LOT 5 (DEC-025 §a).

Ce qui ne se déduit de rien, en revanche, c'est **l'annulation** : une période
ouverte puis abandonnée n'est pas « à venir », et aucune date ne le dirait.

## 4.5 Aucun montant sur la période

`rental_billing_periods` ne porte **aucune colonne de montant** : un total y
serait une seconde vérité que les lignes de facture démentiraient (doctrine D1).
Elle ne porte pas davantage de véhicule ni de tarif — ils vivent dans les
segments, qui restent la source historique.

---

# 5. 🟥 La « facture globale » n'est pas une facture

C'était le point **P-3** du Plan 02, marqué *bloquant · LOT 23*.

**Si elle en était une, le client devrait deux fois la même période** : une fois
par ses factures mensuelles, une fois par la globale. `customer_invoice_total`
compterait les deux, le solde client serait faux, et le tableau de bord aussi.

Le texte de la Direction le dit lui-même : « avec les détails et **les
historiques de payement** ». **Une facture ne porte jamais l'historique de ses
propres règlements** — un relevé, si.

| Lecture | Conséquence |
| --- | --- |
| **Facture** couvrant toute la période | **Double facturation.** Il faudrait annuler les mensuelles — ce que le client vient de payer |
| **Relevé récapitulatif** | **Aucune créance nouvelle.** Exactement le besoin exprimé |

**Ce que le lot en fait**, conformément à la consigne §10 :

1. la base **refuse** une facture sans période sur une longue durée — le chemin
   de la double facturation est fermé, pas seulement déconseillé ;
2. l'écran **dit** ce qu'est ce document, plutôt que de laisser chercher un
   bouton qui doublerait la créance ;
3. les données nécessaires — périodes, factures émises, règlements, solde — sont
   **réunies et consultables** ;
4. **le document lui-même relève du LOT 24**, que le Plan 02 §3.3 et §15.1 lui
   réservent. Le LOT 23 ne l'absorbe pas.

---

# 6. 🟥 Aucune règle de durée n'a été inventée — DEC-008

La consigne §8 l'exigeait : *« Ne choisis pas arbitrairement une règle d'arrondi
ou de calcul journalier si elle n'est pas déjà définie. »*

**La recherche a été faite** : `Règles location` §35, `Workflow 07` §9 et §12
(« les règles de calcul ne doivent pas être inventées par le système »),
`Module 05` §34, DEC-008, DEC-025 §i. **La règle n'existe toujours pas.**

Le lot n'en a pas besoin, et c'est pourquoi **il n'est pas bloqué** :

| Ce qui ne suppose aucune règle | Ce qui en supposerait une |
| --- | --- |
| Une **borne de période**. Le 1ᵉʳ novembre à Moroni est le 1ᵉʳ novembre : c'est un fait de calendrier, la transcription littérale de A-6 | Une **quantité facturée** : jour entamé ? heure de retour ? franchise ? |

**Conséquence, appliquée sans exception** : aucun montant, aucune quantité,
aucune durée n'est calculée par ce lot. La facture naît **en brouillon, sans
ligne** ; l'écran pré-remplit le **prix unitaire verrouillé** de chaque portion
et laisse la **quantité vide**, en disant pourquoi. C'est exactement ce que le
LOT 7 fait depuis le premier jour.

La recette le vérifie **champ par champ** : désignation reprise du segment, prix
unitaire à 50 000, **quantité vide**.

---

# 7. La prolongation — 🟩 A-4

## 7.1 Ce qu'elle fait, et ce qu'elle ne touche pas

| S'étend | Ne bouge pas |
| --- | --- |
| Le **segment ouvert**, et son occupation du calendrier | Les segments **clos** — véhicule, période, tarif |
| Le temps **facturable** ajouté | Les périodes facturables **déjà ouvertes** |
| La date de retour attendue | Les **coûts gelés**, les factures **émises** |

**Le découpage reprend là où il s'arrêtait** : la première période ajoutée part
de la fin de la dernière, fût-elle au milieu d'un mois. Remanier un découpage
déjà posé — et a fortiori déjà facturé — serait réécrire l'histoire.

## 7.2 L'ouverture des périodes est une conséquence, jamais un acte

Même doctrine que le gel du coût au LOT 22 : celui qui prolonge n'a pas à
**demander** l'ouverture des périodes correspondantes. Ne pas les ouvrir
laisserait un intervalle du contrat que **personne ne pourrait facturer** — un
trou dans la créance.

La garde accepte donc **deux** chemins d'ouverture : `rental.rentals.billing.plan`
(l'acte) et `rental.rentals.extend` (la conséquence). Et **rien d'autre** :
`rental.rentals.update` n'en ouvre aucun.

## 7.3 Le motif devient obligatoire — et c'est une conséquence, pas un durcissement

`extend_rental` acceptait un motif **facultatif**. Il ne l'est plus : la
prolongation est désormais un **avenant**, et « un avenant porte toujours son
motif » (LOT 22, `rental_amendments.reason not null`).

## 7.4 🟩 A-5 — le tarif à la prolongation

| Cas | Ce qui s'applique | Ce qu'il exige |
| :-: | --- | --- |
| **1 — ordinaire** | Le tarif du contrat est **conservé** | Rien de plus que `rental.rentals.extend` |
| **2 — nouveau tarif** | Il ne vaut que pour le **temps ajouté** ; l'ancien reste attaché à la période qu'il a couverte | `rental.pricing.override` **et** une raison écrite |

Le second cas **clôt** le segment ouvert à la date de fin initiale et en ouvre un
neuf : `locked_source = 'OVERRIDE'`, journalisé `PRICE_CHANGE`. Aucun `locked_*`
historique n'est réécrit — la recette le vérifie colonne par colonne.

## 7.5 Le barème est montré, jamais appliqué

`Règles location` §24 : *« Le tarif appliqué à une prolongation doit respecter
les règles tarifaires d'ADIKOM. Le système ne doit pas inventer automatiquement
une tarification. »*

L'écran **affiche** ce que le barème donnerait à la date de prolongation — sous
`rental.pricing.view`, et sous elle seule — et laisse **saisir**. Rien n'est
appliqué sans décision.

---

# 8. Le remplacement de l'index d'unicité

L'obstacle que le Plan 02 §1.3 avait identifié et vérifié :

```sql
-- migration 051, ligne 226
create unique index customer_invoices_one_per_rental_idx
  on public.customer_invoices (rental_id)
  where rental_id is not null and status <> 'CANCELLED';
```

Il **interdisait** la facturation périodique. Il a été remplacé **dans l'ordre
exact du Plan 02 §19.3** — toute autre séquence ouvre une fenêtre pendant
laquelle une double facturation est possible :

```
1.  billing_period_id (nullable)        → toutes les factures existantes : NULL
2.  CRÉER les deux index de remplacement
3.  SEULEMENT ENSUITE, supprimer l'ancien
```

Et la migration **refuse de supprimer** l'ancien si ses deux remplaçants ne sont
pas tous deux en place.

| Index | Portée | Ce qu'il interdit |
| --- | --- | --- |
| `…one_per_fixed_rental_idx` | `billing_period_id is null` | Deux factures sur une location à **durée fixée** |
| `…one_per_period_idx` | `billing_period_id is not null` | Deux factures sur la **même période** |

**Les deux sont DISJOINTS** : une facture tombe dans l'un ou dans l'autre, jamais
dans les deux, jamais dans aucun.

**Aucune facture existante n'a changé de régime** : elles portent toutes
`billing_period_id = NULL`, et le premier index les couvre exactement comme
l'ancien. La migration le vérifie elle-même, et la recette le revérifie.

L'étanchéité est tenue **en plus** par le déclencheur de cohérence : une longue
durée refuse une facture **sans** période ; une durée fixée refuse une facture
**avec** période.

---

# 9. Une facture de période ne clôt pas la location

Plan 02 §18.2. Le contrat ne devient « Facturée » que lorsque **deux** conditions
sont réunies : il est « À facturer » — donc rendu et contrôlé — **et** il ne
reste **aucune période découverte**.

C'est la seule lecture vraie de ce mot : *tout ce qui devait être facturé l'a
été*.

Sans cela, une longue durée resterait « À facturer » pour toujours et ne pourrait
**jamais** être clôturée — `close_rental` exige « Facturée ». *Une impasse n'est
pas une garantie* (DEC-027 §e).

**Et l'écran le dit AVANT le geste** : la carte « Émettre » d'une facture de
période annonce que la location reste en cours, au lieu de promettre le
contraire. C'est un défaut que la recette a trouvé (§14.1).

---

# 10. Tables, colonnes et migrations

## 10.1 Table créée

| Table | Rôle | Colonnes portées |
| --- | --- | --- |
| `rental_billing_periods` | **La période facturable** | contrat, rang, période `[début, fin)`, origine, statut, avenant d'origine, auteur et horodatages |

## 10.2 Colonnes ajoutées

| Table | Colonne | Rôle |
| --- | --- | --- |
| `rentals` | `rental_type` | `FIXED_TERM` (défaut) · `LONG_TERM` |
| `rentals` | `billing_cadence` | `MONTHLY` · `CONTRACT_TERM`, `null` en durée fixée |
| `customer_invoices` | `billing_period_id` | La période couverte, `null` sinon |

## 10.3 Types créés

`rental_type` · `rental_billing_cadence` · `rental_billing_origin` ·
`rental_billing_period_status`

**Aucune valeur d'énumération n'a été retirée**, et aucune n'a été ajoutée à un
type existant.

## 10.4 Migrations

| # | Fichier | Rôle |
| :-: | --- | --- |
| **094** | `longue_duree_et_periodes_facturables` | **Schéma** — types, colonnes, table, remplacement des index, gardes, RLS, capacité, journal |
| **095** | `prolongation_par_avenant_et_facturation_par_periode` | **Actes** — découpage, régime, annulation, prolongation, retour, annulation de contrat, les trois fonctions de facturation |
| **096** | `perimetre_de_sauvegarde_des_periodes_facturables` | **Sauvegarde** — 53 → 54 tables, ordre vérifié paire par paire |

Chaque migration porte **ses propres contrôles** et refuse de s'appliquer si le
système est incohérent à l'issue. La 094 a d'ailleurs refusé de s'appliquer à son
premier essai, sur un nom de contrainte erroné — et la transaction a été annulée
entièrement, ce qui a été vérifié en base avant de corriger.

## 10.5 ⚠ Les fonctions réécrites, et depuis quelle version

La leçon inscrite par la migration 093 a été appliquée **à chaque réécriture** :
*une fonction réécrite se reprend à sa **dernière** version*.

| Fonction / policy | Dernière version reprise | Vérifié par |
| --- | :-: | --- |
| `fn_customer_invoice_coherence` | **075** (et non 051) — la levée d'état en restauration | Contrôle de la 094, puis de la 095 |
| `rentals_update` | **093** — ses **dix** capacités | Contrôle capacité par capacité |
| `audit_detail_permission` | **087** — les acquis des LOTS 20, 21, 22 | Contrôle nommé par type d'objet |
| `fn_rental_amendment_guard` | **087** | Contrôle des trois actes |
| `extend_rental` · `return_rental` · `cancel_rental` | **089** — le filtrage par segment | Contrôle sur `rental_segment_id = s.id` |
| `create_…` · `issue_…` · `cancel_customer_invoice` | **051** | Contrôles de signature et de contenu |

**`fn_customer_invoice_coherence` a été réécrite deux fois dans ce lot** — une
fois par la 094 (les deux régimes), une fois par la 095 (la condition de
livraison). C'est assumé et documenté dans l'en-tête de la 095, qui énonce ce
qu'elle reprend et ce qu'elle ajoute.

---

# 11. Permissions — 196 → 197

| Code | Action | Sensible | Ce qu'elle ouvre |
| --- | --- | :-: | --- |
| `rental.rentals.billing.plan` | ADMIN | ✓ | **Définir le régime de facturation** d'une location, et ouvrir ses périodes |

La question de `CLAUDE.md` §19 bis, posée : **oui**, cet acte doit pouvoir
s'attribuer séparément. Décider qu'un contrat se facture chaque fin de mois
plutôt qu'en une fois engage la reconnaissance du chiffre d'affaires d'ADIKOM.
**Aucune capacité existante ne le couvre** : ni `rental.rentals.update`, ni
`checkout`, ni `billing.customer_invoices.create` — préparer une facture n'est
pas décider du découpage des créances d'un contrat.

## 11.1 Ce qui n'a PAS été créé, et pourquoi

| Non créé | Raison |
| --- | --- |
| `rental.rentals.billing.periods.view` | Une période ne porte **ni montant, ni coût, ni tarif**. C'est l'organisation du contrat, que `rental.rentals.view` ouvre déjà. Une capacité de plus ne fermerait qu'un **onglet** (DEC-036 §d, DEC-042 §d) |
| Toute capacité de prolongation | `rental.rentals.extend` **existe** depuis la migration 007. La prolongation devient un avenant ; elle ne devient pas un second acte |
| Toute capacité de changement de tarif | `rental.pricing.override` **existe** et gouverne la dérogation depuis le LOT 22 (consigne §5) |
| Toute capacité de facture de période | `billing.customer_invoices.*` **existent**. Une facture de période **est** une facture client |
| `rental.rentals.penalty.*` | 🟥 **A-7 n'est pas tranchée.** La fonctionnalité n'existe pas |
| `rental.rentals.statement.*` | Le relevé global relève du **LOT 24**. Rien n'est livré, rien n'est gouverné |

La migration **refuse elle-même** toute capacité `rental.rentals.penalty*`,
`…statement*`, `…period*`, `…billing.periods*` ou `*.globale*`, et la recette le
revérifie.

## 11.2 Les séparations, tenues en base

- **`rental.rentals.extend` n'ouvre pas `rental.pricing.override`** — prolonger
  n'a jamais supposé le droit de s'écarter du barème. Éprouvé **dans les deux
  sens**, en SQL et avec de vraies sessions ;
- **ni l'un ni l'autre n'ouvre `rental.rentals.billing.plan`** — l'exploitation
  ne voit même pas le formulaire de régime, et l'écran **dit pourquoi** ;
- **`rental.rentals.view` n'ouvre pas les factures** — l'écran annonce qu'il ne
  peut pas les consulter, plutôt que d'écrire « aucune facture » ;
- **`rental.rentals.view` n'ouvre pas le coût gelé** — ni par la table, ni par
  l'onglet Facturation, ni par la charge utile de la page, ni par le PDF.

---

# 12. 🟥 Ce que le lot NE tranche PAS

## 12.1 A-7 — les pénalités

Ce qui est écrit : « des pénalités de 20 à 100 % ». Ce qui manque toujours : **de
quoi** elles se calculent, **qui** fixe le taux, et s'il s'agit d'une
**majoration du tarif** ou d'une **ligne de facture distincte**.

Le lot livre **le moyen** — un changement de tarif à la prolongation se
représente, se motive, s'historise, s'audite. Il ne livre **aucun barème, aucun
champ de pourcentage, aucune capacité de pénalité**. Trois contrôles le
vérifient : dans le découpage, dans l'acte de prolongation, et à l'écran.

## 12.2 DEC-008 — la durée facturable

Non tranchée (§6). La quantité reste saisie.

## 12.3 P-2, le véhicule de partenariat, et le Plan 02 §5.7

Inchangés depuis DEC-045. `pricing_rules` n'a été **ni touchée ni contrainte**,
`vehicles_origin_attachment_coherent` est intacte, et les recettes du LOT 22 et
du LOT 23 le revérifient toutes deux.

## 12.4 P-5

`service_variant_costs` n'a reçu **aucune colonne `supplier_id`**.

---

# 13. Sécurité, RLS et audit

## 13.1 Trois couches, sur chaque acte

| Couche | Mécanisme |
| --- | --- |
| Interface | Filtrage de confort — **jamais une protection** |
| Action serveur | `requirePermission(…)` en première instruction |
| Base | Policies RLS + `require_capability` dans les gardes et les actes |

`has_permission(…)` est **enveloppée dans un sous-select** dans chaque policy
nouvelle : une garde de RLS s'évalue **par ligne**.

## 13.2 RLS de la table nouvelle

```sql
create policy rental_billing_periods_select on public.rental_billing_periods
  for select to authenticated
  using ((select public.has_permission('rental.rentals.view')));
```

La recette **refuse** que cette policy cite une capacité financière ou
fournisseur : le découpage ne doit pas devenir une porte dérobée.

`DELETE` et `TRUNCATE` sont **retirés** à `authenticated`, `anon` n'a rien.

## 13.3 Audit

| Acte | Événement | Module |
| --- | --- | --- |
| Période facturable — ouverture, troncature, annulation | `CREATE` / `UPDATE` | `rental` |
| Régime et cadence du contrat | `UPDATE`, avec l'**avant / après** | `rental` |
| Avenant de prolongation | **`CREATE`** | `rental` |
| Prolongation avec changement de tarif | **`PRICE_CHANGE`** | `rental` |
| Facture de période — préparation, émission, annulation | `CREATE` / `VALIDATE` / `CANCEL` | `billing` |

Aucune fonction d'audit nouvelle : celles des lots antérieurs sont **réemployées**.

`audit_detail_permission` ouvre `rental_billing_periods` par
`rental.rentals.view` — **ni plus, ni moins que la table**. Et le coût gelé garde
sa lecture jusque dans le journal : la migration et les deux recettes le
revérifient.

---

# 14. Corrections rencontrées

Trois défauts ont été trouvés pendant le lot, tous par les recettes ou par
l'outillage. **Aucun test n'a été désactivé ni assoupli.**

## 14.1 🟥 L'écran promettait ce qui n'allait pas arriver

La carte « Émettre » annonçait, pour **toute** facture rattachée à une location :

> « La location passera « Facturée ». »

**C'est faux d'une facture de période** : d'autres périodes restent à facturer.
L'exploitant aurait cherché ensuite pourquoi son contrat est toujours « En
cours », et aurait conclu à une panne.

La phrase dépend désormais du **régime**, et elle est lue **avant** le geste. Le
message de succès de l'action a été corrigé pour la même raison — même s'il
disparaît avec la carte, il ne doit pas mentir.

## 14.2 Le cache de construction portait les résidus d'un `next dev` interrompu

`npm run build` échouait sur quinze erreurs de police Google, alors que les
polices étaient parfaitement joignables. `.next/` — 2,3 Go — contenait un
répertoire `dev` laissé par une session interrompue. Le cache retiré, la
construction passe.

## 14.3 La recette confondait « en cours » et « fait »

Trois formes d'attente successives se sont révélées fausses, et **chacune
faisait passer la recette à tort** :

| Attente | Pourquoi elle mentait |
| --- | --- |
| Le libellé de succès de l'émission | Il **disparaît avec la carte** « Émettre », qui n'existe que tant que la facture est en brouillon |
| Le « détachement » du bouton | Après une action serveur, React **remplace le nœud** : l'ancien handle devient détaché même si le bouton est toujours là |
| Le **comptage** des boutons | Le libellé change pendant l'envoi (« Émission… ») : compter revenait à confondre « en cours » et « fait » |

Ce qui est éprouvé désormais est **l'état de la facture en base**, et le geste
est rejoué jusqu'à ce qu'il soit atteint.

---

# 15. Données de démonstration

Un cas de longue durée a été ajouté, `R8` :

| | |
| --- | --- |
| Contrat | `VEHICULE DEMO 06`, 32 000 KMF/jour, J-100 → J-30 |
| Régime | **Longue durée · mensuelle** |
| Périodes | **3**, contiguës, closes au 1ᵉʳ du mois **comorien** |
| Facture | **1**, émise, sur la première période |
| État du contrat | **En cours** — la facture de période ne le clôt pas |

La démonstration montre donc exactement ce que le lot apporte : le découpage à la
fin du mois, une facture par période, les autres restant « Facturables », et la
location qui **reste en cours** malgré une facture émise.

**Aucune quantité n'est inventée** : la ligne de facture porte une quantité
**saisie**, comme à l'écran.

Le régime et la facture passent par les **fonctions**, jamais par des `insert`.
Le script est **idempotent** — rejoué, il crée zéro élément — et le cycle
`demo:seed` → `demo:clean` → `demo:seed` a été exécuté **dans les deux sens**.

---

# 16. Responsive et UX

| Format | Résultat |
| --- | --- |
| **360 px** | ✅ aucun débordement |
| **768 px** | ✅ |
| **1440 px** | ✅ |

L'onglet **Facturation** a été **ajouté au balayage responsive**, sur une
location portant **réellement** des périodes facturables : mesurer un contrat à
durée fixée ne dirait rien du tableau des périodes ni du formulaire de facture.

**Les champs restent de vrais champs** : une date est une date, un choix est un
`select`, un motif est un `textarea`, le choix entre deux cas exclusifs se fait
par deux **boutons radio**. Aucune case à cocher ne remplace un champ.

**Tous les champs des formulaires nouveaux sont pilotés** : React 19 remet à zéro
les champs non pilotés dès que l'action s'achève, **y compris sur un refus** —
c'est le défaut que la recette du LOT 22 avait trouvé, et il ne se reproduit pas.

---

# 17. Sauvegarde, réinitialisation, restauration

## 17.1 🟩 La sauvegarde préalable, cette fois tenue

Le LOT 22 avait signalé que la sauvegarde exigée par le Plan 02 §19.2 **n'avait
pas été prise** avant sa migration de données. La consigne du LOT 23 en a fait
une étape **bloquante**.

**Elle a été prise, et vérifiée, avant la première migration.**

| | |
| --- | --- |
| Outil | `npm run backup:snapshot` — nouveau, il appelle `admin_backup_export`, la **même** fonction que le bouton des Paramètres |
| Fichier | `SAUVEGARDES_ADIKOM/adikom-pilot-LOT23-avant-migration-2026-09-22T06-41-16.json` |
| Emplacement | **Hors du dépôt** — il contient des données confidentielles, et un `.gitignore` se contourne d'un `git add -f` |
| Taille | 140 Kio |
| Contenu vérifié | **53 tables**, **180 lignes**, format et version reconnus, configuration présente |
| Exploitabilité | Le fichier est **relu depuis le disque**, et ses compteurs comparés **table par table** aux `count(*)` réels |

Ce dernier point est le seul qui compte : un fichier présent n'est pas une
sauvegarde. Un export qui aurait lu à travers une policy restrictive écrirait un
fichier bien formé et **vide** — c'est exactement l'échec qu'on ne verrait pas.

Une **seconde** sauvegarde a été prise avant le cycle destructif de recette
(54 tables, 191 lignes), pour la même raison.

## 17.2 Le périmètre

`backup_scope()` passe de **53 à 54 tables** :

```
rentals ──▶ rental_amendments ──▶ rental_billing_periods ──▶ customer_invoices
                   │
                   └──▶ rental_segments ──▶ rental_segment_costs
```

`rental_billing_periods` cite `rental_amendments` : elle vient **après** lui.
`customer_invoices` la cite : elle vient **après** elle. La réinitialisation
parcourt la liste à l'envers, et vide donc les factures **avant** les périodes.

La migration **vérifie l'ordre paire par paire**, et non par un décompte : une
liste fautive peut porter le bon nombre de tables.

## 17.3 Le cycle complet, éprouvé pour de vrai

`verify:backup` a **réinitialisé et restauré la base réelle** : **191 lignes**
sauvegardées, supprimées, puis restaurées à l'identique, table par table.

**Après restauration, le régime du contrat, sa cadence, ses trois périodes et le
rattachement de sa facture étaient intacts** — vérifié en base, ligne par ligne,
après le cycle.

---

# 18. Tests

## 18.1 Recette de base — `npm run db:verify:billing`

**20 contrôles, tous réussis.**

| # | Ce qu'il éprouve |
| :-: | --- |
| 1 | Une capacité, sensible, ADMIN, bien placée — **et aucune de plus** |
| 2 | Table, RLS, suppression et TRUNCATE refermés, `anon` exclu, lecture gardée |
| 3 | **Les deux index DISJOINTS**, l'ancien retiré, la chaîne Facture → Location préservée |
| 4 | Actes en `SECURITY INVOKER`, garde en `DEFINER`, **jour comorien**, aucun barème |
| 5 | Périmètre de sauvegarde : 54 tables, périodes **entre** leur avenant et leur facture |
| 6 | Trois profils réels : exploitation, facturation, dérogation |
| 7 | Décor : 3 véhicules fournis, tarifs 50 000 / 60 000 / 55 000 |
| 8 | 🟩 **A-6** : 4 périodes mensuelles contiguës, **closes à la fin du mois comorien**, la dernière avec le contrat |
| 9 | Deux factures sur un contrat, **aucune seconde** sur une période, **aucune facture globale**, régime figé |
| 10 | 🟩 A-6 : une période **encore en cours** ne se facture pas |
| 11 | 🟩 **A-4** : même contrat, un avenant de prolongation, périodes antérieures **intactes**, temps ajouté facturable |
| 12 | 🟩 **A-5** : ancien tarif conservé sur sa période, nouveau sur le temps ajouté, dérogation motivée et **journalisée** |
| 13 | **Sept refus** : chevauchement, trou, rang, suppression, début déplacé, période facturée, période du milieu |
| 14 | Le **retour** ramène les périodes non facturées à la réalité, sans creuser de trou |
| 15 | « Facturée » **seulement** quand aucune période ne reste découverte ; l'annulation la défait |
| 16 | Les deux régimes sont **étanches** : ni période sur durée fixée, ni période d'un autre contrat |
| 17 | 🟩 A-6 : la cadence **contractuelle** produit **une** période, du début à la fin |
| 18 | L'annulation du contrat annule ses périodes, **sans les effacer** |
| 19 | Le journal enregistre les périodes et les prolongations, **sans ouvrir le coût gelé** |
| 20 | Acquis intacts : `pricing_rules`, segments, coût gelé, cohérence du parc |

## 18.2 Recette applicative — `npm run verify:billing`

**77 contrôles, tous réussis** — en local **et en production**, avec de **vraies
sessions** : jeton Supabase, cookie applicatif, appels PostgREST directs, PDF.

| Section | Ce qu'elle éprouve |
| :-: | --- |
| 1 | Le décor, et le **régime par défaut** : aucune location ne change (Plan 02 §19.4) |
| 2 | 🟩 **A-14** : l'exploitation n'a **pas** le formulaire de régime, et l'écran dit pourquoi |
| 3 | 🟩 **A-6 monté par l'écran** : les deux cadences proposées, **aucune inventée**, bornes au 1ᵉʳ du mois **à Moroni** |
| 4 | La période se facture ; **désignation et prix repris, quantité VIDE** ; la location **reste « En cours »** |
| 5 | **Jamais deux factures** sur une période — par l'acte **et** par appel direct ; facture globale **refusée** |
| 6 | 🟩 **A-4 monté par l'écran** : même contrat, un `AVN-…`, périodes antérieures intactes |
| 7 | 🟩 **A-5** : refus sans `override`, refus sans raison, puis nouveau tarif **sur le seul temps ajouté** |
| 8 | Les refus par appel direct, et le **coût gelé qui reste fermé** |
| 9 | La page et le **document** : période nommée, **aucun coût**, 403 sans la capacité |
| 10 | Catalogue conforme, jeu DEMO intact, **aucune erreur de console** |

## 18.3 Contrôles unitaires

`src/features/billing-periods/schema.test.ts` — **22 tests**. Notamment :

- une longue durée **sans cadence** est refusée : la Direction a validé les
  **deux**, le système n'en choisit aucune à sa place ;
- une cadence **sur une durée fixée** est refusée : elle ne gouvernerait rien ;
- `WEEKLY` est refusée — aucune case ne la coche ;
- les schémas **n'exposent aucun champ** de pénalité, de pourcentage, de
  quantité, de montant ni de durée ;
- « Facture en brouillon » **n'est pas** « Facturée » : aucune créance n'est
  reconnue tant qu'elle reste en brouillon ;
- une borne **illisible** ne devient jamais « Facturable » — mieux vaut ne pas
  proposer de facturer que de proposer à tort ;
- 🟩 **le cas de la consigne §11** : deux véhicules, deux tarifs, **deux
  portions**, et la bascule appartient à la **suivante** ;
- une intersection de **durée nulle** n'est pas une portion ;
- une portion **ne porte aucun terme** du domaine du coût ;
- 21 h UTC le 30 septembre est daté du **1ᵉʳ octobre** dans la désignation.

`src/lib/documents/document.test.ts` — **3 tests nouveaux** : la facture de
période rendue avec sa période, sans période, et lorsqu'elle n'est pas lisible.

## 18.4 Chaîne complète

| Commande | Résultat |
| --- | --- |
| `npm run lint` | ✅ |
| `npm run typecheck` | ✅ |
| `npm test` | ✅ **319 tests** (17 fichiers) |
| `npm run build` | ✅ |

---

# 19. Tests négatifs

| Tentative | Résultat |
| --- | --- |
| Définir le régime sans `rental.rentals.billing.plan` | **Refusé** — `insufficient_privilege` |
| Prolonger **sans motif** | **Refusé** — un avenant porte toujours son motif |
| Changer le tarif à la prolongation **sans `override`** | **Refusé** — `extend` n'ouvre pas `override` |
| Nouveau tarif **sans raison écrite** | **Refusé** |
| Raison de changement **sans montant** | **Refusé** — elle ne motiverait rien |
| Prolonger avec **le tarif déjà en vigueur** | **Refusé** — un avenant consigne un changement |
| Deux factures sur **la même période** — par l'acte | **Refusé**, et le refus **nomme la facture** |
| Deux factures sur la même période — **par appel direct** | **Refusé** par l'index unique partiel |
| Facture **sans période** sur une longue durée | **Refusé** — elle doublerait la créance |
| Facture **avec période** sur une durée fixée | **Refusé** — les régimes sont étanches |
| Facturer une période **non échue** | **Refusé** |
| Facturer une période **annulée** | **Refusé** |
| Facturer la période d'un **autre contrat** | **Refusé** |
| Facturer un contrat **jamais parti**, annulé ou clôturé | **Refusé** |
| Changer le **régime** après une facture | **Refusé** |
| Deux périodes qui **se recouvrent** | **Refusé** par la contrainte d'exclusion |
| Une période **détachée** (trou) | **Refusé** par la contiguïté |
| Un **rang** de période incohérent | **Refusé** |
| **Déplacer le début** d'une période | **Refusé** |
| **Annuler** une période **facturée** | **Refusé** |
| **Annuler** une période **du milieu** | **Refusé** — un trou ne se facture jamais |
| **Rouvrir** une période annulée | **Refusé** |
| **Supprimer** une période | **Refusé** |
| Ouvrir une période **sans capacité** | **Refusé** |
| Ouvrir une période sur une **durée fixée** | **Refusé** |
| Lire le **coût gelé** depuis l'onglet Facturation | **Aucune ligne**, par aucune voie |
| Télécharger la facture **sans `download`** | **HTTP 403** |

---

# 20. Non-régression

| Surface | Résultat |
| --- | --- |
| **26 recettes SQL** | ✅ **469 contrôles**, toutes sans erreur |
| `verify:billing` | ✅ **77 contrôles** |
| `verify:capabilities` | ✅ **217 contrôles** — les 197 capacités, code par code |
| `verify:amendments` | ✅ **74 contrôles** — **LOT 22 intact** |
| `verify:production` | ✅ **56 contrôles** |
| `verify:responsive` | ✅ **389 contrôles**, 399 boutons |
| `verify:backup` | ✅ **50 contrôles** — réinitialisation et restauration **réelles** |
| `verify:ajustements` | ✅ **95 contrôles** |
| `verify:audit` | ✅ **82 contrôles** |
| `verify:groups` | ✅ **73 contrôles** |
| `verify:supplier-rates` | ✅ **61 contrôles** — LOT 21 intact |
| `verify:pilotage` | ✅ **60 contrôles** |
| `verify:customer-invoices` | ✅ **52 contrôles** |
| `verify:catalog` | ✅ **49 contrôles** — LOT 20 intact |
| `verify:password-reset` | ✅ **43 contrôles** — LOT 19 intact |
| `verify:customer-payments` | ✅ **36 contrôles** |
| `verify:rentals` | ✅ **34 contrôles** |
| `verify:users` | ✅ **14 contrôles** |

**`supabase/tests/location.sql` se rejoue sans modification**, et DEC-002
départage toujours par la date de création.

## 20.1 🟥 Deux contrôles du LOT 22 ont légitimement évolué

La consigne §19 l'exigeait : *« Si un test doit légitimement évoluer parce que le
métier a réellement évolué, documente précisément pourquoi. »*

| Contrôle | Ce qu'il disait | Ce qu'il dit, et pourquoi |
| :-: | --- | --- |
| **15** | La prolongation n'allonge que le segment ouvert | **Inchangé**, et le contrôle vérifie **en plus** que l'avenant est consigné. A-4 s'applique désormais à la prolongation |
| **17** | Le contrat porte 1 avenant après tous les refus | Le compte est **relevé avant** les tentatives, non écrit en dur. Ce n'est pas le nombre qui est la règle — c'est que **rien n'a bougé** |
| **21** | L'avenant de prolongation est **refusé** et nomme le LOT 23 | Le refus est **levé** : le LOT 23 livre l'acte. Il est remplacé par l'**exigence de capacité** correspondante, et le contrôle **revérifie qu'A-7 reste non tranchée** |

**Aucun test n'a été assoupli** : le contrôle 21 est devenu un test négatif de
permission, là où il était un test d'absence de fonctionnalité.

---

# 21. Documentation

| Fichier | Nature |
| --- | --- |
| `00 Documentation/08_Decisions/01_Journal_des_Decisions.md` | **DEC-047 consignée** (treize sections), index mis à jour |
| `00 Documentation/03_Modules/05_Gestion_de_Location.md` | Addendum daté — les deux régimes, les deux découpages, la prolongation, le relevé |
| `00 Documentation/04_Workflows/07_Facturation.md` | Addendum daté — plusieurs factures par location, ce qui est repris et ce qui reste saisi |
| `00 Documentation/02_Architecture_Fonctionnelle/02_Navigation.md` | Addendum daté — **aucune entrée de menu** : un onglet, et ce qu'il ouvre |

**DEC-047 était libre** : le Plan 02 §21 ne réserve que DEC-043 à DEC-046, toutes
consignées. Aucun numéro déjà attribué n'a été réemployé.

`CLAUDE.md` **n'a pas été modifié** : le lot n'ajoute aucun module, et la
documentation ne se modifie pas pour justifier une implémentation (§52).

---

# 22. Ce qui n'a PAS été développé

**Rien de ce que la consigne interdit n'a été touché** :

❌ relevé / synthèse de location · ❌ barème de pénalité · ❌ règle de durée
facturable · ❌ devis et commandes · ❌ PDV · ❌ facturation des services ·
❌ `supplier_id` sur les coûts de services · ❌ contrainte d'exclusion sur
`pricing_rules` · ❌ faux fournisseur ADIKOM

Et par ailleurs :

- **aucune permission existante modifiée** — le catalogue s'allonge d'une ;
- **aucune valeur d'énumération retirée** ;
- **aucune suppression physique** ;
- **aucun système parallèle** de facture, de paiement ou de trésorerie ;
- **aucun `locked_*` réécrit** — les tarifs déjà appliqués sont hors d'atteinte ;
- **aucune facture existante modifiée** ;
- **le Design System inchangé** — les composants existants sont réemployés.

---

# 23. Limites

| Limite | Portée |
| --- | --- |
| **🟥 A-7 non tranchée** | Le modèle est livré, **le barème non**. Aucun pourcentage n'est calculé |
| **🟥 DEC-008 non tranchée** | Aucune durée facturable, aucune quantité proposée. La commission reste **non totalisée** pour la même raison |
| **🟥 Le relevé global** | Préparé, **non produit**. LOT 24 |
| **🟥 P-2 et le véhicule de partenariat** | Inchangés depuis DEC-045 |
| **🟥 P-5** | `service_variant_costs` intacte |
| **Le régime se pose sur un contrat existant** | Il n'est pas proposé à la création d'une location : l'écran de conversion n'a pas été touché. Ce n'est pas un manque de sécurité — c'est un geste de plus, et il est signalé plutôt que réputé acquis |
| **La cadence n'a pas d'historique propre** | Son changement est **journalisé** (avant / après, qui, quand), ce qui répond à la consigne §15. Une table de versions n'a pas été créée : elle ne gouvernerait rien de plus, et l'**origine** de chaque période, elle, est figée à son ouverture |
| **`fn_customer_invoice_coherence` réécrite deux fois** | Une fois par la 094, une fois par la 095, dans le même lot. Assumé et documenté dans l'en-tête de la 095 (§10.5) |
| **Le document de validation n'est pas sur ce poste** | `Validation_Direction_ADIKOM_PILOT_14_decisions.pdf` reste absent. Les décisions employées sont celles **transcrites mot pour mot** par le `Plan 02` §2.1 et reprises dans la consigne du lot |
| **`verify:permissions`** | Non exécutée : `ADIKOM_ADMIN_USERNAME` n'est pas dans l'environnement de ce poste. Limite d'**environnement**, antérieure au lot |

---

# 24. Commits

| SHA | Message |
| --- | --- |
| **`04ea1a5`** | `feat: location longue duree, prolongation par avenant et facturation par periode` |

Aucun secret, aucun artefact de construction, `.env.local` ignoré, sauvegardes
écrites **hors du dépôt** — vérifié avant le commit par un balayage du diff.

---

# 25. Déploiement

| | |
| --- | --- |
| SHA **éprouvé** | **`04ea1a5`** — la recette de production a tourné contre lui |
| SHA **déployé** | **`04ea1a5`** |
| État Vercel | **`READY`** |
| URL | https://adikom-pilot.vercel.app |

Le sha déployé a été lu par l'API Vercel et **comparé au commit local** : la
production porte exactement le code éprouvé.

---

# 26. Recette de production

Exécutée contre **https://adikom-pilot.vercel.app**, sur le déploiement portant
`04ea1a5`.

| Recette | Résultat |
| --- | --- |
| `verify-billing-periods.mjs` | ✅ **77 contrôles, tous réussis** |
| `verify-capabilities.mjs` | ✅ **217 contrôles** — les 197 capacités, code par code |
| `verify-responsive.mjs` | ✅ **389 contrôles**, 399 boutons |
| `verify-ajustements.mjs` | ✅ **95 contrôles** |
| `verify-audit.mjs` | ✅ **82 contrôles** |
| `verify-amendments.mjs` | ✅ **74 contrôles** — LOT 22 intact |
| `verify-groups.mjs` | ✅ **73 contrôles** |
| `verify-supplier-rates.mjs` | ✅ **61 contrôles** — LOT 21 intact |
| `verify-pilotage.mjs` | ✅ **60 contrôles** |
| `verify-production.mjs` | ✅ **56 contrôles** |
| `verify-customer-invoices.mjs` | ✅ **52 contrôles** |
| `verify-catalog.mjs` | ✅ **49 contrôles** — LOT 20 intact |
| `verify-password-reset.mjs` | ✅ **43 contrôles** — LOT 19 intact |
| `verify-customer-payments.mjs` | ✅ **36 contrôles** |
| `verify-rentals.mjs` | ✅ **34 contrôles** |
| `verify-users.mjs` | ✅ **14 contrôles** |
| `verify-backup.mjs` | ✅ **50 contrôles** — réinitialisation et restauration **réelles**, contre le build déployé |

## 26.1 Les points exigés, un par un

| # | Point exigé (consigne §18) | Vérifié |
| :-: | --- | --- |
| 1 | Location longue durée | Régime posé par l'écran, 3 périodes ouvertes |
| 2 | Prolongation par avenant | `AVN-…` numéroté, motivé, daté |
| 3 | Conservation du même contrat | Numéro et identifiant **inchangés** |
| 4 | Conservation de l'historique des segments | Segments clos intacts — période, tarif, statut |
| 5 | Prolongation **sans** changement de tarif | Segment ouvert allongé, aucun segment neuf |
| 6 | Prolongation **avec** changement de tarif autorisé | Segment neuf, `OVERRIDE`, ancien tarif conservé |
| 7 | Refus d'une dérogation **sans permission** | `insufficient_privilege`, dans les deux sens |
| 8 | Refus d'une dérogation **sans justification** | Refusé au niveau du champ **et** en base |
| 9 | Création correcte des périodes facturables | Contiguës, alignées sur le mois comorien |
| 10 | Absence de chevauchement / double facturation | Contrainte d'exclusion + index unique partiel |
| 11 | Facturation mensuelle | 4 périodes en SQL, 3 en production |
| 12 | Facturation selon période contractuelle | **Une** période, du début à la fin |
| 13 | Plusieurs factures sur une même location | **Deux** factures vivantes, éprouvé |
| 14 | Lien exact facture ↔ période | `billing_period_id`, lu et affiché |
| 15 | Impossibilité de facturer deux fois la même période | Refusé par l'acte **et** par appel direct |
| 16 | Conservation des factures existantes | Toutes en `billing_period_id = NULL`, régime inchangé |
| 17 | Conservation des règlements existants | `verify:customer-payments` ✅ |
| 18 | Confidentialité des coûts fournisseurs | Aucune voie : table, écran, charge utile, PDF |
| 19 | Plusieurs segments dans une même période | Éprouvé unitairement (portions) |
| 20 | Remplacement de véhicule pendant une période | Portions distinctes, tarifs distincts |
| 21 | Changement de tarif pendant une période | idem |
| 22 | Audit | Périodes, régime, avenant, `PRICE_CHANGE` |
| 23 | Permissions / RLS | Trois profils réels, refus éprouvés |
| 24 | API directe | PostgREST : période forgée, facture forgée, régime forcé — **refusés** |
| 25 | Documents | PDF `%PDF`, période nommée, aucun coût, 403 sans capacité |
| 26 | Sauvegarde / reset / restauration | Cycle réel, 191 lignes, données du lot intactes |
| 27 | Responsive | 360, 768 et 1440 px, onglet Facturation compris |
| 28 | Absence de résidus | §26.2 |

## 26.2 Aucun résidu

Comptes, clients, véhicules, fournisseur, catégories, tarifs, contrats, avenants,
périodes facturables et factures de recette **supprimés**. Vérifié en base après
chaque passage, par **balayage au marqueur** — et non par les seuls identifiants
suivis, qu'un passage interrompu ne connaîtrait pas.

Le jeu de démonstration est **intact** — `{clients: 6, vehicles: 8, suppliers: 4,
supplierInvoices: 3, imputations: 1}` avant comme après.

La page publique annonce **197 capacités attribuables**, lues en base.

---

# 27. Conclusion

Le LOT 23 répond à une question que le SaaS ne savait pas poser : **comment
facture-t-on un contrat qui dure ?**

**Par période, et une seule facture par période.** C'est la décision de la
Direction, et c'est désormais ce que la base garantit — par deux index disjoints,
une contrainte d'exclusion, une contiguïté et cinq refus. Le même temps ne peut
pas être facturé deux fois, et aucun intervalle du contrat ne reste hors
facturation.

**La prolongation garde le contrat.** Elle consigne son avenant, allonge la
période en cours, ouvre le temps facturable ajouté — et ne touche à rien de ce
qui est déjà engagé : ni un segment clos, ni un tarif historique, ni un coût
gelé, ni une période déjà facturée.

**Et la « facture globale » n'est pas une facture.** C'était le piège le plus
coûteux du lot : une double facturation se découvre au relevé bancaire, des
semaines plus tard. Le chemin est fermé en base, l'écran dit pourquoi, et le
document — un relevé — reste au LOT 24, à qui le Plan 02 le réserve.

**Aucune règle métier n'a été inventée.** Le barème de pénalité d'A-7 n'existe
toujours pas, et aucun pourcentage n'est proposé. La règle d'arrondi de durée de
DEC-008 n'existe toujours pas, et aucune quantité n'est supposée. Le lot livre ce
dont il a besoin — des bornes de calendrier — et laisse saisir ce qu'il ne sait
pas calculer.

**Et la sauvegarde préalable a été prise.** Le LOT 22 avait signalé ne pas
l'avoir fait ; la consigne en a fait une étape bloquante ; elle est désormais
outillée, vérifiée ligne par ligne contre la base, et écrite hors du dépôt.

---

## LOT 23 — TERMINÉ

**CODE TESTÉ** — 20 contrôles de base · 77 contrôles applicatifs ·
25 tests unitaires nouveaux · 26 recettes SQL · 16 recettes applicatives ·
aucune régression

**GITHUB À JOUR** — `04ea1a5` sur `main`

**VERCEL À JOUR** — `04ea1a5`, état `READY`

**PRODUCTION VALIDÉE** — 17 recettes, **1 462 contrôles** (77 + 217 + 389 + 95 +
82 + 74 + 73 + 61 + 60 + 56 + 52 + 50 + 49 + 43 + 36 + 34 + 14) contre
https://adikom-pilot.vercel.app, aucun résidu

**SAUVEGARDE PRÉALABLE PRISE ET VÉRIFIÉE** — avant la première migration,
53 tables, 180 lignes, hors du dépôt

**SAUVEGARDE ÉPROUVÉE** — réinitialisation et restauration réelles, 191 lignes,
régime, cadence, périodes et rattachement de facture intacts

**RAPPORT CRÉÉ** — le présent document

---

*ADIKOM PILOT — SaaS interne de gestion et de pilotage — ADIKOM Technology & Travel*
