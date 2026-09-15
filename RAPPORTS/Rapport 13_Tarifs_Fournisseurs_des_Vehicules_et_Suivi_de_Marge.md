# Rapport 13 — Tarifs fournisseurs des véhicules et suivi de marge

## LOT 21 · Module 05 « Gestion de location » — Coût d'acquisition et commission

| | |
| --- | --- |
| Date | 15 septembre 2026 |
| Lot | **LOT 21** du `Plan 02` — 3ᵉ des dix lots |
| Décision | **DEC-044** — coût d'acquisition et confidentialité |
| Sources métier | Direction, 11/09/2026 — **A-1**, **A-2**, **A-3**, **A-14** |
| Commit | **`496fe60`** |
| SHA éprouvé | **`496fe60`** |
| SHA déployé | **`496fe60`** — déploiement Vercel `READY` |
| Production | https://adikom-pilot.vercel.app |
| Catalogue | **191 → 195 capacités** |
| Sauvegarde | **49 → 50 tables** |
| Migrations | 82 → **86** |

---

# 1. Objectif

Le SaaS savait répondre à **« à quel tarif ADIKOM loue-t-elle ce véhicule à son
client ? »**. Il ne savait pas répondre à **« combien ce véhicule lui
coûte-t-il ? »**, ni donc à **« que lui reste-t-il ? »**.

Le cas de référence, écrit par la Direction :

```
ADIKOM loue un véhicule à un fournisseur     40 000 KMF / jour
ADIKOM le propose à son client               50 000 KMF / jour
─────────────────────────────────────────────────────────────
COMMISSION DE LOCATION                       10 000 KMF / jour
```

Objectif second, de même poids : **cette information ne doit jamais sortir.**
« Le tarif fournisseur est confidentiel ; seul le tarif facturé au client et les
services liés apparaissent dans les documents » (A-2).

---

# 2. Périmètre

## 2.1 Ce que le lot livre

- la table `supplier_vehicle_rates` — **versions datées du coût d'acquisition** ;
- trois **résolveurs** prenant une date d'effet, dont deux par lot ;
- deux **actes** — ouvrir une version, en retirer une ;
- **quatre capacités**, et pas une de plus ;
- l'écran **Tarifs fournisseurs**, l'onglet **Coût fournisseur** de la fiche
  véhicule, la carte **Commission de location** du contrat ;
- l'export, le journal, la sauvegarde, le jeu de démonstration.

## 2.2 Ce que le lot ne livre pas — et n'a pas commencé

Aucune ligne n'a été écrite sur : remplacement de véhicule, segments de location,
avenants, longue durée, facturation périodique, synthèse de fin de location,
devis et commandes clients ou fournisseurs, point de vente, sessions de caisse.

**Et aucune refonte** : le module Location n'est pas réécrit, `vehicle_occupations`
n'est pas touchée, aucune table de fournisseur ni de véhicule n'est créée, aucun
système parallèle de facture, de paiement ou de trésorerie n'existe.

---

# 3. Décisions métier appliquées

| Réf. | Ce que la Direction a décidé | Ce que le lot en fait |
| :-: | --- | --- |
| **A-2** | Le tarif fournisseur est **confidentiel** | Table séparée + policy dédiée + journal gardé par la même capacité + documents client hors d'atteinte |
| **A-2** | `PRIX CLIENT = TARIF FOURNISSEUR + COMMISSION + SERVICES` | La **commission** est nommée, calculée, jamais stockée. La part « services » attend les lots Commerce |
| **A-1** | Coût **journalier** ✓ et **forfait par location** ✓ | `DAY` et `FLAT`. **Le tarif mensuel n'est pas coché : il n'existe pas** |
| **A-1** | Des **conditions hors tarif ordinaire** existent | Champ `conditions` sur chaque version — aucune table « conditions négociées » |
| **A-3** | « ADIKOM est un fournisseur » | **Non tranché** — voir §4. Aucun coût sur un véhicule ADIKOM |
| **A-14** | Permissions **indépendantes par action** | `pricing.view` n'ouvre pas `supplier.view` ; `create` n'ouvre pas `update` ; voir n'est pas exporter |

---

# 4. 🟥 Ce que le lot NE tranche PAS

## 4.1 P-2 — le coût interne d'un véhicule ADIKOM

**A-3 dit « ADIKOM est un fournisseur ». Elle ne dit pas ce qu'est ce coût.**

> **(a)** un tarif de référence fixé par la Direction, comme si ADIKOM se louait
> à elle-même, ou **(b)** un coût de revient calculé — amortissement, assurance,
> entretien ?

**(b) est aujourd'hui impossible** : aucune de ces charges n'est enregistrée par
véhicule. **(a) supposerait une décision** qui n'est écrite nulle part.

**Ce que le lot fait** : un coût d'acquisition ne s'enregistre que sur un
véhicule `SUPPLIED`. Le déclencheur refuse les autres **et nomme la décision
manquante** — à l'écran comme en appel direct. La marge d'un véhicule ADIKOM
reste **non calculée** plutôt que fausse, ce que le Plan 02 §3.2 exige
explicitement.

**Ce que le lot se garde de faire** : rendre l'évolution impossible. Le jour où
la Direction répondra, l'ajout est **additif** — `supplier_id` nullable, un
indicateur `is_internal`, et la contrainte d'exclusion, déjà posée sur le seul
véhicule, n'a pas à changer. Aucune reprise de données.

**Aucune fiche fournisseur « ADIKOM » n'a été créée, et aucun véhicule ADIKOM
n'est devenu `SUPPLIED`** : la voie (a) du Plan 02 §3.2 reste refusée, et
`vehicles_origin_attachment_coherent` est intacte.

## 4.2 🟥 Un troisième cas, que le Plan 02 n'avait pas vu

**Le véhicule de partenariat.** Deux véhicules du parc sont `PARTNERSHIP` : ni à
ADIKOM, ni fournis par un fournisseur. Leur coût relève des conditions du
partenariat, qu'aucun module ne gère et qu'**aucune décision ne définit**.

Le refus le dit, pour sa propre raison, sans le confondre avec P-2.

**Question à poser en même temps que P-2** :

> « Un véhicule mis à disposition dans le cadre d'un partenariat a-t-il un coût
> pour ADIKOM, et si oui sous quelle forme — un montant convenu, une part de
> recette, une contrepartie ? »

## 4.3 P-1 — le tarif fournisseur dépend-il du client final ?

Non tranché, **non bloquant**, et le Plan 02 §2.3 indiquait déjà la voie : une
condition négociée n'est pas une seconde nature de tarif, c'est une **version
datée supplémentaire** portant son motif écrit. C'est ce qui est livré. Le
résolveur reste `(véhicule, date)` ; y ajouter le client changerait sa clé, et
cela ne se fait pas sans décision.

## 4.4 P-6 — type de client et destination

**Hors périmètre livré.** Ces deux axes concernent le **tarif client**
(`pricing_rules`), que ce lot ne touche pas. Le Plan 02 §3.6 range d'ailleurs la
« destination » hors du périmètre du plan. Le point reste ouvert et n'a bloqué
aucune partie de ce lot.

## 4.5 A-8 et P-5 — le catalogue de services

**A-8 est déjà traité** par le LOT 20 (DEC-043 §e) et **n'a pas été rediscuté**.
Aucune architecture de coûts de services n'a été créée en double.

**P-5 reste explicitement ouvert** : un service a-t-il un prix d'achat unique, ou
un par fournisseur ? `service_variant_costs` n'a reçu **aucune colonne
`supplier_id`**, et aucune règle n'a été inventée pour combler ce vide.

---

# 5. 🟥 Le Plan 02 §5.7 est ÉCARTÉ — il contredit DEC-002

## 5.1 Ce que le plan recommandait

Une **contrainte d'exclusion sur `pricing_rules`**, refusant deux règles de
**portée identique** dont les périodes se recouvrent, en trois temps : recenser,
puis poser la contrainte si le compte est nul.

## 5.2 Le recensement a été mené

En lecture seule, sur la base de production : **6 règles actives, ZÉRO
chevauchement à portée identique.** Le compte était donc nul.

## 5.3 Et la contrainte a quand même été retirée

Elle a été posée, puis **retirée le jour même**, pour une raison qui n'est pas de
données mais de **règle** :

> **DEC-002 — « À égalité de spécificité, le tarif le plus récemment créé
> s'applique. »**

Cette règle **suppose** que deux tarifs de portée identique coexistent : elle
n'aurait aucun objet autrement. Elle est implémentée par `resolve_pricing_rule`
(migration 017) et **éprouvée par `supabase/tests/location.sql` §15**, qui insère
précisément deux règles `client + véhicule` concurrentes et vérifie que la plus
récente l'emporte.

**La contrainte recommandée fait donc échouer une règle métier en vigueur**, et
`location.sql` avec elle — alors que le Plan 02 §18 et §20.1 exigent que cette
recette se rejoue **sans modification**. Modifier le test pour accommoder la
contrainte aurait été la faute inverse, et la consigne §22 l'interdit
expressément.

## 5.4 Ce qui est fait à la place

`pricing_rules` **n'est pas touchée** — ni colonne, ni contrainte, ni donnée. La
recette du lot **interdit désormais** qu'une telle contrainte y soit posée, et
dit pourquoi : le contrôle 18 échoue si quelqu'un la repose.

**L'exigence « empêcher les chevauchements incohérents » est tenue là où elle a
un sens** : sur `supplier_vehicle_rates`, où un véhicule n'a qu'**un** coût à une
date donnée, et où la base le garantit par une contrainte d'exclusion.

**Question à la Direction, si elle souhaite le comportement du §5.7** :

> « Faut-il rouvrir DEC-002 ? Interdire deux tarifs de portée identique sur une
> même période supprimerait la règle de départage par date de création, et
> obligerait à clore explicitement un tarif avant d'en ouvrir un autre. »

---

# 6. ⚠️ Une précision sur le Plan 02 : la contrainte citée a changé de nom

Le Plan 02 §3.2 nomme `vehicles_origin_supplier_coherent` (migration 015) et la
donne pour en production. **Elle n'y est plus** : la migration 025
(Partenariats) l'a remplacée par `vehicles_origin_attachment_coherent`, qui
couvre trois cas au lieu de deux :

| Origine | Rattachement |
| --- | --- |
| `SUPPLIED` | un fournisseur, pas de partenaire |
| `PARTNERSHIP` | un partenaire, pas de fournisseur |
| `OWNED` · `OTHER` | ni l'un ni l'autre |

La substance du constat du plan tient : un véhicule ADIKOM ne peut toujours pas
porter de fournisseur. Mais **un contrôle qui aurait vérifié le nom cité n'aurait
rien vérifié du tout** — et c'est ainsi que le défaut a été découvert, la
migration ayant refusé de s'appliquer.

---

# 7. Analyse réalisée

Analyse **ciblée**, conformément à la consigne — aucune relecture générale du
projet. Ont été inspectés, et seulement eux :

| Surface | Ce qui en a été tiré |
| --- | --- |
| `Plan 02` §3.2, §5.4, §5.6, §5.7, §6, §9, §10.2, §13, §19.5, §20.1 | Le périmètre exact du lot, sa table, ses quatre capacités |
| `Rapport 12` (LOT 20) | La forme d'une table de versions, d'un résolveur, d'un acte |
| Migration 081 — catalogue de services | Le patron **intégral** de D16, réemployé sans le réinventer |
| Migration 015 puis **025** — parc et partenariats | L'origine d'un véhicule, et la contrainte réellement en vigueur |
| Migration 017 — `pricing_rules` / `resolve_pricing_rule` | DEC-002, sa colonne générée, et son **départage par date** |
| Migration 044 — `maintenance_costs` | Le précédent d'une **donnée sensible en table séparée** |
| Migration 055, 062, 065, 069, 075 | Cohérence avant acteur · garde qui compte la vérité · sous-select · motif non réécrit · `is_restoring()` |
| Migration 064 — `audit_detail_permission` | La cartographie des lectures du journal (DEC-038) |
| `permissions.ts` · `permissions.test.ts` · `lib/capabilities.mjs` | La parité TS ↔ SQL, et **l'interdiction d'un total en dur** |
| `navigation.ts` · `exports/registry.ts` · `documents/registry.ts` | Les trois registres qu'une fonctionnalité nouvelle doit alimenter — ou dont elle doit rester absente |
| Fiche véhicule, onglet « Rentabilité » | La **marge d'exploitation**, à ne jamais confondre avec la commission |
| `seed-demo.mjs` · `clean-demo.mjs` | Le marquage DEMO et son retrait |
| Base de production, en lecture seule | 6 tarifs, 9 véhicules (3 fournis · 4 ADIKOM · 2 partenariat), 4 fournisseurs, 3 locations |

**Aucun total de capacités n'a été réintroduit.** Les recettes nomment les
capacités qu'elles éprouvent ; seule la migration 083 affirme un total, daté.

---

# 8. Documentation

| Fichier | Nature |
| --- | --- |
| `00 Documentation/08_Decisions/01_Journal_des_Decisions.md` | **DEC-044 consignée** (dix sections), index mis à jour |
| `00 Documentation/03_Modules/05_Gestion_de_Location.md` | Addendum daté — les quatre notions, l'historisation, la confidentialité, les points ouverts |
| `00 Documentation/02_Architecture_Fonctionnelle/02_Navigation.md` | Addendum daté — l'entrée « Tarifs fournisseurs » et pourquoi elle est distincte |

`CLAUDE.md` **n'a pas été modifié** : le lot n'ajoute aucun module, et la
documentation ne se modifie pas pour justifier une implémentation (§52).

---

# 9. Table créée

| Table | Rôle | Lignes portées |
| --- | --- | --- |
| `supplier_vehicle_rates` | **Versions datées du coût d'acquisition** d'un véhicule fourni | véhicule, fournisseur, montant, unité, `valid_from`, `valid_to`, conditions, motif |

**Aucune table existante n'a été modifiée.** Aucune colonne ajoutée ailleurs,
aucune donnée réinterprétée, aucune énumération étendue.

## 9.1 Contraintes structurantes

| Objet | Ce qu'il ferme |
| --- | --- |
| `exclude using gist` sur **le seul véhicule** | À une date donnée, un véhicule n'a qu'**un** coût — y compris entre **deux saisies simultanées**, qu'aucun déclencheur ne verrait (DEC-028) |
| `check (amount > 0)` | Un coût nul ou négatif n'existe pas |
| `check (valid_to >= valid_from)` | Une période ne se referme pas avant de s'ouvrir |
| `fn_supplier_vehicle_rate_guard` | Véhicule **fourni**, fournisseur **rattaché**, non archivé, véhicule non retiré — et **aucune version ne se réécrit** |

**Pourquoi l'exclusion porte sur le véhicule seul** : le résolveur s'écrit
`resolve_supplier_rate(véhicule, date)`. Deux versions actives qui se
recouvriraient — fût-ce pour deux fournisseurs différents — rendraient la
question sans réponse. Le changement de fournisseur reste possible : l'ancienne
version se clôt, la nouvelle s'ouvre, et **chacune garde son fournisseur**.

## 9.2 Une version ne se réécrit jamais

Le déclencheur refuse toute modification du **montant**, de l'**unité**, de la
**devise**, de la **date d'effet**, du **motif**, du **véhicule** et du
**fournisseur** d'une version. Seuls se modifient :

- `valid_to` — la **clôture**, conséquence mécanique de l'ouverture d'une autre ;
- `is_active` et son motif de retrait — le **retrait**, sous `update` ;
- `conditions` — les **conditions négociées écrites**, sous `update`.

Le **motif du changement** et le **motif du retrait** sont deux colonnes
distinctes : un motif ne se réécrit pas après coup (migration 069).

---

# 10. Permissions ajoutées — 191 → 195

| Code | Action | Sensible |
| --- | --- | :-: |
| `rental.pricing.supplier.view` | VIEW | ✓ |
| `rental.pricing.supplier.create` | CREATE | ✓ |
| `rental.pricing.supplier.update` | UPDATE | ✓ |
| `rental.pricing.supplier.export` | EXPORT | ✓ |

**Les quatre sont sensibles** : le coût fournisseur est confidentiel (A-2).

## 10.1 Ce que chacune ouvre, exactement

- **`view`** — lire les coûts, les résolveurs, l'historique, le détail au
  journal. C'est la **seule** capacité qui ouvre la table.
- **`create`** — **ouvrir une version datée**. Clore celle qu'elle remplace en
  est la conséquence mécanique (D16(a)) : c'est un seul geste, et une seule
  capacité.
- **`update`** — **retirer** une version, ou corriger ses **conditions écrites**.
  Retirer un coût sans qu'aucun autre ne le remplace change ce qui s'applique et
  laisse le véhicule sans coût connu : c'est un acte à part.
- **`export`** — emporter le fichier. **Voir n'est pas emporter** (DEC-024).

## 10.2 Ce qui n'a **pas** été créé, et pourquoi

| Non créé | Raison |
| --- | --- |
| Toute capacité de **marge** ou de **commission** | Une commission est la différence de **deux grandeurs déjà gouvernées** — `supplier.view` et `rentals.financial.view`. Une capacité de plus ne fermerait **rien** (`CLAUDE.md` §19 bis, Plan 02 §10.3) |
| `.download` / `.print` | Aucun document n'est produit par ce lot, et un coût ne figure sur **aucun** document remis à un tiers |
| `.archive` / `.delete` | Rien ne se supprime ; une version se **retire** sous `update` |
| `.history.view` | L'historique vit dans une table **déjà gardée** par `view` |

La migration **refuse elle-même** toute capacité `rental.pricing.supplier.*` hors
des quatre attendues, et la recette SQL le revérifie.

## 10.3 Les séparations, tenues en base

- **`rental.pricing.view` n'ouvre pas `rental.pricing.supplier.view`** — gérer le
  barème client n'a jamais supposé de connaître ce qu'ADIKOM paie ;
- **`rental.fleet.view` non plus** — consulter le parc n'ouvre pas le coût ;
- **`rental.rentals.financial.view` non plus** — voir les montants d'un contrat
  n'ouvre pas ce qu'il coûte ;
- **`create` n'ouvre pas `update`**, et réciproquement — éprouvé dans les deux
  sens, avec deux profils partiels.

---

# 11. Fonctionnalités développées

## 11.1 Écrans

| Écran | Route | Capacité |
| --- | --- | --- |
| Tarifs fournisseurs — parc, coût applicable **à une date**, commission indicative | `/location/tarifs-fournisseurs` | `rental.pricing.supplier.view` |
| Fiche véhicule — onglet **Coût fournisseur** : commission + chronologie + saisie | `/location/parc/[id]?onglet=cout-fournisseur` | idem |
| Contrat de location — carte **Commission de location** | `/location/locations/[id]` | idem **+** `rental.rentals.financial.view` |

**Aucun onglet « à venir », aucune entrée inerte.** Les trois surfaces
**disparaissent entièrement** sans la capacité : une carte vide se lirait « ce
véhicule ne coûte rien », affirmation qu'un refus de lecture ne permet pas
(DEC-017).

## 11.2 La date d'effet est un filtre, et c'est tout l'intérêt

L'écran d'ensemble porte un sélecteur de date qui interroge le résolveur
exactement comme une location le ferait : **« quel coût s'appliquait le 15
septembre ? »** s'y répond sans attendre ni remonter le temps.

## 11.3 Ce que l'écran dit quand il ne montre rien

**Trois absences différentes, trois messages différents** — les confondre sous un
tiret ferait passer une décision manquante pour une saisie oubliée :

| Situation | Ce que l'écran dit |
| --- | --- |
| Véhicule ADIKOM ou de partenariat | « Sans objet — véhicule non fourni par un fournisseur », et la décision attendue est nommée |
| Aucune version applicable à cette date | « Aucun coût renseigné au JJ/MM/AAAA » |
| Capacité absente | « Protégé par une permission dédiée, que votre compte ne détient pas » |

Et **cinq raisons de non-calcul** de la commission, chacune avec son message :
tarif client inaccessible, coût inaccessible, aucun coût à cette date, véhicule
non fourni, **unités différentes**.

## 11.4 Les unités ne se soustraient pas entre elles

50 000 **par jour** moins 40 000 **de forfait** ne fait pas 10 000 : ce sont deux
grandeurs différentes. La commission n'est calculée que si les deux montants
portent **la même unité**, et l'écran le dit sinon.

## 11.5 Export

Un export : `tarifs-fournisseurs`. Il porte **l'historique entier**, versions
retirées comprises, avec périodes, conditions et motifs.

**Pourquoi celui-ci porte les montants alors que celui des services n'en porte
aucun** : l'export des services a pour objet l'**identité** du catalogue, et y
ajouter un prix supposerait de le résoudre à une date — une seconde
implémentation de la résolution dans un classeur. Ici, **le montant EST l'objet**
: un export de tarifs fournisseurs sans tarif ne serait pas un export, et la
capacité ne débloquerait rien (`CLAUDE.md` §19 bis).

Le classeur porte son avertissement en sous-titre : **document interne, à ne
remettre à aucun client**. Et il exige **deux** capacités : `view` pour ne pas
produire un fichier vide qu'on lirait « aucun coût », `export` pour l'emporter.

---

# 12. Historisation — D16 réemployée, non réinventée

```
set_supplier_vehicle_rate(véhicule, fournisseur, montant, unité, date, conditions, motif)
        │
        ├── clôt la version courante        → valid_to = date d'effet − 1
        ├── borne la nouvelle si une version ULTÉRIEURE existe déjà
        └── ouvre la nouvelle version
```

**Aucun montant n'est jamais réécrit.** Aucune version ne se supprime : elle se
clôt, ou se **retire** — et le motif du retrait est enregistré à part de celui du
changement.

## 12.1 Le scénario de la Direction, éprouvé

```
40 000 KMF/jour  jusqu'au 30/09          ← version close, montant intact
45 000 KMF/jour  à partir du 01/10       ← saisie AVANT le 1er octobre

Location du 15/09  →  40 000       ✔ vérifié
Location du 15/10  →  45 000       ✔ vérifié
Date antérieure à toute version → AUCUNE LIGNE, jamais zéro   ✔ vérifié
Trou entre deux versions        → AUCUNE LIGNE                ✔ vérifié
```

## 12.2 Le jour est comorien, pas UTC

La date d'effet par défaut des trois résolveurs s'écrit
`(now() at time zone 'Indian/Comoro')::date`. Et la date d'effet d'une opération
est **sa date métier** — le **départ du contrat**, non le jour de la consultation
(Plan 02 §5.6, DEC-025 §e).

## 12.3 Le changement de tarif ne retarife pas le passé

Clore la version courante à la veille de la nouvelle **est** la garantie : une
location commencée avant cette date continue de relever de l'ancien coût.

**La limite, nommée** : une version ouverte **délibérément** à une date d'effet
passée modifie la commission affichée des contrats de cette période. C'est un
acte explicite, permissionné et journalisé — jamais un effet de bord. Le
verrouillage du coût sur le segment (`locked_cost_*`) fermera ce dernier écart au
**LOT 22**, et l'architecture livrée l'attend sans rien devoir défaire.

---

# 13. Quatre notions, quatre noms, jamais confondus

C'est le **principal risque métier du lot** (Plan 02 §16.1), et il se traite par
le vocabulaire.

| Nom | Définition | Portée | Ouvert par |
| --- | --- | --- | --- |
| **Coût d'acquisition** | Ce qu'ADIKOM verse au fournisseur | une **date** | `rental.pricing.supplier.view` |
| **Tarif client** | Ce qu'ADIKOM facture — l'unique montant des documents client | un **contrat** ou le barème | `rental.pricing.view` · `rental.rentals.financial.view` |
| **Commission de location** | Tarif client − coût d'acquisition, sur la **seule** mise à disposition | un **contrat** | les **deux** ci-dessus |
| **Marge d'exploitation** | Revenus facturés − coût d'entretien net supporté | la **vie** d'un véhicule | onglet « Rentabilité » |

**Aucun intitulé existant n'a été renommé.** L'onglet « Rentabilité » et sa carte
« Marge d'exploitation » sont inchangés ; une phrase y a été ajoutée qui renvoie
à la commission et dit ce qui les sépare. Réciproquement, chaque écran de
commission **énumère ce qu'elle ne couvre pas** et renvoie à la rentabilité.

---

# 14. Sécurité et RLS

## 14.1 Trois couches, sur chaque acte

| Couche | Mécanisme |
| --- | --- |
| Interface | Filtrage de confort — **jamais une protection** |
| Action serveur | `requirePermission(…)` en première instruction |
| Base | Policies RLS + `require_capability` dans les fonctions et le déclencheur |

`has_permission(…)` est **enveloppée dans un sous-select** dans chaque policy :
une garde de RLS s'évalue **par ligne** (migration 065).

## 14.2 La garantie centrale

```sql
create policy supplier_vehicle_rates_select on public.supplier_vehicle_rates
  for select to authenticated
  using ((select public.has_permission('rental.pricing.supplier.view')));
```

`rental.fleet.view`, `rental.pricing.view`, `parties.suppliers.view` et
`rental.rentals.financial.view` **n'y figurent pas**, et c'est tout l'objet de la
table séparée : **RLS filtre des lignes, pas des colonnes**. Un coût rangé sur la
fiche du véhicule serait rendu par un `select *` à quiconque consulte le parc.

La migration **refuse elle-même** que cette policy cite l'une de ces quatre
capacités ; la recette SQL le revérifie ; et la recette applicative le vérifie
**avec de vraies sessions**.

## 14.3 Trois barrières contre la fuite (Plan 02 §6.3)

| # | Barrière | Ce qu'elle arrête |
| :-: | --- | --- |
| **1** | La donnée est dans une **table à part** | Un `select *` sur une table mixte |
| **2** | La lecture exige **sa** capacité | Un appel PostgREST direct autant qu'un écran |
| **3** | Les **générateurs de documents** ne reçoivent jamais ces colonnes | Une fuite par un fichier, qui sort du système et circule |

La barrière 3 est la seule qui tienne même quand le demandeur **détient** la
capacité : un Super Admin qui télécharge un contrat a le droit de lire le coût —
s'il figurait dans le modèle, il sortirait. Elle est garantie **à la source** par
un contrôle unitaire qui **relit les modèles documentaires** et refuse toute
référence au domaine du coût. Il vaudra aussi pour la synthèse de location
(LOT 24) et les devis (LOT 25).

## 14.4 La cohérence avant l'acteur, et une garde qui compte la vérité

Les règles de cohérence sont posées **avant** tout test de capacité : les placer
après les effacerait pour la clé de service, donc pour un script (migration 055).

`fn_supplier_vehicle_rate_guard` est `SECURITY DEFINER` et lit `vehicles` et
`suppliers` **en base**, non ce que l'acteur peut voir : un porteur de `create`
dépourvu de `rental.fleet.view` verrait « véhicule introuvable » à tort
(migration 062). Elle **ne renvoie aucune ligne** : elle refuse, ou laisse
passer.

**Aucune fonction métier n'est `SECURITY DEFINER`** — les cinq résolveurs et
actes sont `SECURITY INVOKER`, et la migration comme la recette le vérifient
(doctrine D4).

---

# 15. Audit

| Acte | Événement | Module |
| --- | --- | --- |
| Coût d'acquisition — ouverture, clôture, retrait, correction | **`PRICE_CHANGE`** | `rental` |

La fonction d'audit du LOT 20 (`fn_audit_price_row`) est **réemployée** : aucune
fonction d'audit nouvelle n'a été créée. Un troisième domaine écrit des prix, et
il écrit le même événement.

## 15.1 Le journal ne contourne pas la confidentialité

`audit_detail_permission` est étendue à `supplier_vehicle_rates`, qui s'ouvre par
**`rental.pricing.supplier.view`** — jamais par `rental.pricing.view` ni par
`rental.fleet.view`.

**Éprouvé avec un profil qui détient `users.audit.view`** : sans cela, le refus
n'aurait prouvé que son incapacité à lire le journal. Avec elle, il prouve ce qui
compte — **lire le journal n'ouvre pas le coût**, le journal **nomme** la capacité
qui manque, et le porteur de la capacité lit **le même** événement.

Aucun mot de passe, aucun secret, aucun jeton n'entre au journal : rien de tel
n'existe dans ce domaine.

---

# 16. Sauvegarde, réinitialisation, restauration

`backup_scope()` passe de **49 à 50 tables**. `supplier_vehicle_rates` est placée
**après ses deux parents** :

```
suppliers ─┐
           ├──▶ supplier_vehicle_rates
vehicles ──┘
```

La migration **vérifie l'ordre elle-même**, et vérifie aussi que le catalogue de
services du LOT 20 n'a pas disparu du périmètre — la fonction étant réécrite en
entier, une omission se lirait comme une suppression silencieuse.

`TRUNCATE` est retiré à `authenticated` : il ne déclenche aucun déclencheur de
ligne et contournerait `fn_forbid_delete`.

## 16.1 Le cycle complet, éprouvé pour de vrai

`verify:backup` a **réinitialisé et restauré la base réelle** : **165 lignes**
sauvegardées, supprimées, puis restaurées **à l'identique, table par table**.
Après restauration, les **trois versions datées** du coût d'acquisition étaient
intactes, périodes comprises, et les policies en place.

---

# 17. Données de démonstration

`VEHICULE DEMO 02` — fourni par `FOURNISSEUR DEMO 01` — porte **une chronologie**,
et non un montant :

| Version | Montant | Période |
| --- | --- | --- |
| Contrat initial | 26 000 KMF/jour | **échue** |
| Révision annuelle | 30 000 KMF/jour | **en vigueur** |
| Hausse convenue | 34 000 KMF/jour | **à venir** |

Le barème client de sa catégorie étant de 40 000 KMF/jour, la démonstration
montre une **commission de 10 000 KMF/jour** — l'écart exact décrit par la
Direction, **sans déplacer le barème existant** pour faire joli.

**Aucun coût sur les véhicules ADIKOM ni de partenariat** : un jeu de
démonstration ne tranche pas ce que la Direction n'a pas tranché.
`VEHICULE DEMO 05` reste **sans coût**, délibérément : c'est le cas « coût
absent », celui où la commission n'est pas calculée.

Les coûts passent par **la fonction**, jamais par un `insert` : c'est ce qui
garantit la chronologie. Le script est **idempotent**.
`demo:seed` → `demo:clean` → `demo:seed` a été exécuté **dans les deux sens**.

---

# 18. Tests

## 18.1 Recette de base — `npm run db:verify:supplier-rates`

**19 contrôles, tous réussis.**

| # | Ce qu'il éprouve |
| :-: | --- |
| 1 | Quatre capacités, sensibilité, arborescence — et **aucune de plus** |
| 2 | La table, RLS active, `DELETE` et `TRUNCATE` refermés, `anon` exclu |
| 3 | **Le coût ne s'ouvre QUE par sa capacité**, et la garde est enveloppée |
| 4 | Cinq fonctions, **aucune métier en `SECURITY DEFINER`**, **jour comorien** |
| 5 | Périmètre de sauvegarde — 50 tables, tarifs **après** leurs parents |
| 6 | Trois profils réels : coûts, location **sans** coûts, lecture seule du parc |
| 7 | Décor : un fournisseur, un véhicule fourni, un ADIKOM, un de partenariat |
| 8 | **Le cas de la Direction** — 40 000 / 45 000, aucune réécriture, aucun zéro |
| 9 | Chevauchement, montant nul, période inversée, doublon de date : **refusés** |
| 10 | **🟥 Véhicule ADIKOM et de partenariat refusés ; P-2 nommée ; parc intact** |
| 11 | Fournisseur étranger, fournisseur **archivé**, véhicule **retiré** : refusés |
| 12 | Montant, unité, date et motif **inaltérables** ; seules les conditions se corrigent |
| 13 | **Ouvrir et retirer sont deux actes**, refusés séparément ; la version retirée demeure |
| 14 | Rien ne se supprime |
| 15 | Commission calculable (10 000) et **stockée nulle part** |
| 16 | `PRICE_CHANGE` journalisé ; le détail garde **sa** lecture |
| 17 | Un **trou** ne rend aucune ligne, et le véhicule reste visible sans coût |
| 18 | **`pricing_rules` intacte** : DEC-002 départage encore, aucune contrainte posée |
| 19 | Résolution **par lot** identique à la résolution unitaire, sans duplication |

## 18.2 Recette applicative — `npm run verify:supplier-rates`

**61 contrôles, tous réussis** — en local **et en production**, avec de **vraies
sessions** : jeton Supabase, cookie applicatif, appels PostgREST directs,
documents PDF.

| Section | Ce qu'elle éprouve |
| --- | --- |
| 1 | Le décor : un fournisseur, quatre véhicules, quatre barèmes clients |
| 2 | **Le cas de la Direction monté par l'écran**, puis confirmé par le résolveur |
| 3 | **10 000 · −5 000 · coût absent · véhicule ADIKOM** — les quatre issues |
| 4 | **Le profil location n'obtient le coût par AUCUNE voie** — table, résolveur, résolution par lot, écran, onglet, menu |
| 5 | Aucune fuite par l'**export** ni par le **journal** |
| 6 | **Voir n'est pas écrire**, et la chronologie est intacte après les refus |
| 7 | L'écran d'ensemble, et **sa date d'effet** — le coût de demain s'y lit |
| 8 | **La commission d'un contrat réel**, sur le tarif verrouillé et le coût de **sa** date |
| 9 | Aucun effet de bord, catalogue conforme, jeu DEMO intact, **aucune erreur de console** |

**Le profil `location` est le cœur de la recette** : il détient le parc, le
barème, les contrats, leurs montants **et le journal**, et ne détient aucune
capacité de coût. Sans `users.audit.view`, le refus du journal n'aurait prouvé
que son incapacité à lire le journal ; avec elle, il prouve ce qui compte.

**Chaque page ouverte est écoutée** : exceptions non rattrapées et erreurs de
console sont collectées, le bruit d'hébergement est écarté nommément, et le
verdict est rendu à la fin. **Zéro message** sur les écrans parcourus.

## 18.3 Contrôles unitaires

`src/features/supplier-rates/schema.test.ts` — **20 tests**. Notamment :

- `40000.75` est **refusé**, jamais arrondi en silence ;
- le tarif **mensuel** est refusé — il n'est pas coché par la Direction ;
- une date d'effet **future est acceptée** — c'est le besoin ;
- **aucune date de fin n'est saisie** : la base la pose ;
- une correction ne propose **que** les conditions — ni montant, ni unité, ni date, ni motif ;
- `50 000 − 40 000 = 10 000` et `60 000 − 40 000 = 20 000` ;
- une commission **négative** est rendue telle quelle ;
- un coût absent donne `NO_COST_AT_DATE`, **jamais 50 000** ;
- deux unités différentes ne se soustraient pas ;
- une commission **nulle** est une commission, pas une absence.

`src/lib/documents/document.test.ts` — **1 test structurel** : aucun modèle
documentaire ne référence le domaine du coût.

## 18.4 Chaîne complète

| Commande | Résultat |
| --- | --- |
| `npm run lint` | ✅ |
| `npm run typecheck` | ✅ |
| `npm test` | ✅ **268 tests** (15 fichiers) |
| `npm run build` | ✅ 63 pages |

---

# 19. Tests négatifs

| Tentative | Résultat |
| --- | --- |
| Lire les coûts sans `supplier.view` — table, résolveur, **résolution par lot**, écran, onglet, journal, export | **Aucune ligne**, par aucune voie |
| Ouvrir l'écran sans la capacité | `/acces-refuse?requis=rental.pricing.supplier.view` |
| Trouver l'entrée dans la barre latérale sans la capacité | **Absente** |
| Voir la commission d'un contrat sans la capacité | **Carte absente** ; le tarif client reste visible |
| Trouver le coût dans la **charge utile** de la page d'un contrat | **Document propre** |
| Exporter sans `supplier.export` | **HTTP 403** |
| Exporter avec `view` seul | **HTTP 403** — voir n'est pas emporter |
| Enregistrer un coût sur un véhicule **ADIKOM** | **Refusé** — le message nomme **P-2** |
| Enregistrer un coût sur un véhicule de **partenariat** | **Refusé** — pour sa propre raison |
| Désigner un fournisseur **étranger** au véhicule | **Refusé** |
| Ouvrir un coût auprès d'un fournisseur **archivé** | **Refusé** |
| Ouvrir un coût sur un véhicule **retiré** du parc | **Refusé** |
| Deux versions actives qui se **chevauchent** | **Refusé** par la contrainte d'exclusion |
| Deux versions débutant le **même jour** | **Refusé**, et l'acte demandé est nommé |
| Montant **nul ou négatif** | **Refusé** |
| Période **inversée** | **Refusé** |
| **Réécrire** le montant, l'unité, la date d'effet ou le motif d'une version | **Refusé** — quatre refus distincts |
| **Retirer** une version avec `create` seul | **Refusé** |
| **Ouvrir** une version avec `update` seul | **Refusé** |
| `insert` direct sans capacité d'écriture | **Refusé**, chronologie intacte |
| **Supprimer** une version | **Refusé** |
| Lire le détail d'un coût au journal **avec `users.audit.view`** | **`may_read = false`**, capacité manquante **nommée** |

---

# 20. Non-régression

| Surface | Résultat |
| --- | --- |
| **24 recettes SQL** | ✅ toutes sans erreur, **`location.sql` sans modification** |
| `verify:capabilities` | ✅ **217 contrôles** |
| `verify:backup` | ✅ **50 contrôles** — réinitialisation et restauration réelles |
| `verify:audit` | ✅ **82 contrôles** |
| `verify:ajustements` | ✅ **95 contrôles** |
| `verify:groups` | ✅ **73 contrôles** |
| `verify:pilotage` | ✅ **60 contrôles** |
| `verify:customer-invoices` | ✅ **52 contrôles** |
| `verify:catalog` | ✅ **49 contrôles** — **LOT 20 intact** |
| `verify:password-reset` | ✅ **43 contrôles** — LOT 19 intact |
| `verify:rentals` | ✅ **34 contrôles** |
| `verify:users` | ✅ **14 contrôles** |
| `verify:responsive` | ✅ **369 contrôles**, dont **l'écran nouveau** à 360, 768 et 1440 px |
| `verify:production` | ✅ **56 contrôles** |

**Aucun lot existant ne régresse.** Le LOT 20 est intact : catalogue, catégories,
variantes, prix historisés, coûts d'achat, permissions, RLS, audit, sauvegarde et
résolution des prix. **P-5 reste ouvert ; A-8 n'a pas été rediscuté.**

---

# 21. Corrections rencontrées

## 21.1 `vehicles_origin_supplier_coherent` n'existe plus

La migration a refusé de s'appliquer : le Plan 02 cite une contrainte remplacée
depuis la migration 025. Voir §6. **Le contrôle porte désormais sur la contrainte
réelle** — vérifier un nom périmé n'aurait rien vérifié.

## 21.2 La contrainte du §5.7 contredisait DEC-002

Détectée par `location.sql`, qui a échoué au premier balayage complet des
recettes. Voir §5. **La contrainte a été retirée, et non le test.**

## 21.3 Une recette qui déplaçait ce qu'elle ne pouvait pas remettre

Une première version de la recette applicative **posait** un coût sur le véhicule
d'un contrat de démonstration, puis le retirait. Le retrait supprimait la ligne
créée — mais il ne pouvait pas **rouvrir la période que l'ouverture avait close
la veille** (D16(a)). Le jeu de démonstration gardait donc un **trou de
chronologie** qu'aucun nettoyage ne voyait : *un `finally` ne défait que ce qu'il
a créé, jamais ce qu'il a déplacé.*

La section n'écrit plus rien : elle **lit** le contrat, demande au résolveur le
coût applicable **à la date du contrat**, et vérifie que l'écran affiche cet
écart. La chronologie de démonstration a été remise en état.

## 21.4 Une résolution par ligne, deux fois évitée

L'écran d'ensemble résolvait le coût **puis** le tarif client véhicule par
véhicule — un aller-retour par ligne. Refaire le prédicat en TypeScript aurait
été une **seconde implémentation** de D16(c) et de DEC-002. Deux fonctions de
lot ont donc été créées, qui **appellent** les résolveurs existants en jointure
latérale : le prédicat reste écrit une fois, et les recettes vérifient que ces
fonctions **délèguent** réellement.

---

# 22. Ce qui n'a PAS été développé

**Rien de ce que la consigne interdit n'a été touché** :

❌ produits · ❌ achats fournisseurs · ❌ devis et commandes fournisseurs ·
❌ devis et commandes clients · ❌ PDV · ❌ sessions de caisse ·
❌ remplacement de véhicule · ❌ segments de location · ❌ avenants ·
❌ contrats longue durée · ❌ facturation périodique ·
❌ synthèse de fin de location · ❌ résolution de P-5 ·
❌ nouvelle architecture pour A-8

Et par ailleurs :

- **aucune refonte** — le Design System, les composants et les écrans existants
  sont inchangés ;
- **aucune permission existante modifiée** — le catalogue s'allonge, il ne se
  réécrit pas ;
- **aucune table existante modifiée** ; une seule colonne **déjà jointe**
  (`vehicles.origin`) est désormais lue par la fiche d'une location, sans ouvrir
  le moindre accès ;
- **`vehicle_occupations` n'est pas touchée**, et aucune source de location n'est
  modifiée ;
- **aucune suppression physique** ;
- **aucun système parallèle** de facture, de paiement ou de trésorerie —
  *imputation fournisseur ≠ paiement fournisseur* reste entier.

---

# 23. Limites

| Limite | Portée |
| --- | --- |
| **🟥 P-2 non tranchée** | Aucun coût sur un véhicule ADIKOM ; commission non calculée. Évolution **additive** décrite au §4.1 |
| **🟥 Véhicule de partenariat** | Aucune décision n'existe. Même traitement, message distinct |
| **🟥 Plan 02 §5.7 écarté** | `pricing_rules` intacte. L'arbitrage suppose de rouvrir DEC-002 (§5) |
| **Coût non verrouillé sur le contrat** | La commission se **recalcule** à la date du contrat. Une saisie **rétroactive délibérée** la déplace ; `locked_cost_*` fermera l'écart au LOT 22 (§12.3) |
| **Commission du véhicule seul** | La part « services » de la formule A-2 attend les lots Commerce. Chaque écran le dit |
| **P-1 non tranchée** | Le coût ne dépend pas du client final ; les conditions négociées sont des versions datées portant leur motif |
| **`verify:permissions`** | Non exécutée : `ADIKOM_ADMIN_USERNAME` n'est pas dans l'environnement de ce poste. Limite d'**environnement**, antérieure au lot |

---

# 24. Commits

| SHA | Message |
| --- | --- |
| **`496fe60`** | `feat: cout d acquisition des vehicules fournisseurs et commission de location` |

Aucun secret, aucun artefact de construction, `.env.local` ignoré — vérifié avant
le commit.

---

# 25. Déploiement

| | |
| --- | --- |
| SHA **éprouvé** | **`496fe60`** |
| SHA **déployé** | **`496fe60`** |
| État Vercel | **`READY`** |
| URL | https://adikom-pilot.vercel.app |

Le sha déployé a été lu par l'API Vercel et **comparé au commit local** : la
production porte exactement le code éprouvé.

---

# 26. Recette de production

Exécutée contre **https://adikom-pilot.vercel.app**, sur le déploiement portant
`496fe60`.

| Recette | Résultat |
| --- | --- |
| `node scripts/verify-supplier-rates.mjs https://adikom-pilot.vercel.app` | ✅ **61 contrôles, tous réussis** |
| `node scripts/verify-production.mjs https://adikom-pilot.vercel.app` | ✅ **56 contrôles, tous réussis** |
| `node scripts/verify-responsive.mjs https://adikom-pilot.vercel.app` | ✅ **369 contrôles, tous réussis** — 362 boutons mesurés |
| `node scripts/verify-catalog.mjs https://adikom-pilot.vercel.app` | ✅ **49 contrôles** — **LOT 20 intact en production** |
| `node scripts/verify-rentals.mjs https://adikom-pilot.vercel.app` | ✅ **34 contrôles** |

## 26.1 Les quatorze points exigés, un par un

| # | Point | Vérifié en production |
| :-: | --- | --- |
| 1 | **Accès au module** | L'écran s'ouvre, l'entrée figure dans la barre latérale |
| 2 | **Permissions** | Écran refusé sans la capacité, avec le code exigé dans l'URL ; entrée absente du menu |
| 3 | **Création d'un tarif** | 40 000 KMF/jour enregistré **par l'écran** |
| 4 | **Modification** | 45 000 à une date **future** ; l'ancienne version close, non réécrite |
| 5 | **Historique** | Deux versions datées, périodes exactes, versions retirées conservées |
| 6 | **Résolution par date** | 40 000 avant la bascule, 45 000 après ; **rien** avant toute version |
| 7 | **Calcul de marge** | 10 000 · −5 000 · non calculée sans coût · non calculée sur véhicule ADIKOM · 4 000 sur un **contrat réel** |
| 8 | **Absence de fuite** | Table, résolveur, résolution par lot, écran, onglet, menu, journal, export, **charge utile de la page** |
| 9 | **Export** | 403 sans la capacité, 403 avec la seule lecture, classeur avec |
| 10 | **Audit** | `PRICE_CHANGE` journalisé ; le détail garde **sa** lecture ; la capacité manquante est **nommée** |
| 11 | **Non-régression location** | 34 contrôles ✅ ; contrat PDF produit ; tarif verrouillé intact |
| 12 | **Non-régression véhicule** | Fiche, onglets, rentabilité inchangés ; 369 contrôles responsive ✅ |
| 13 | **Non-régression tarification client** | `pricing_rules` intacte ; DEC-002 départage toujours ; `location.sql` sans modification |
| 14 | **Responsive** | L'écran nouveau mesuré à **360, 768 et 1440 px** |

## 26.2 Aucun résidu

Comptes, véhicules, fournisseur, catégorie et tarifs de recette **supprimés**.
Vérifié en base après le passage :

```
tarifs de recette      : 0
véhicules de recette   : 0
comptes de recette     : 0
catalogue              : 195
périmètre de sauvegarde: 50 tables
migrations appliquées  : 86
```

Le jeu de démonstration est **intact** — `{clients: 6, vehicles: 8,
suppliers: 4, supplierInvoices: 3, imputations: 1}` avant comme après — et la
chronologie du coût d'acquisition de `VEHICULE DEMO 02` est **contiguë** :
26 000 → 30 000 → 34 000, sans trou.

La page publique annonce **195 capacités attribuables**, lues en base et non
recopiées.

---

# 27. Conclusion

Le LOT 21 répond à une question que le SaaS ne savait pas poser : **que reste-t-il
à ADIKOM ?**

**Un coût est une ligne datée.** Le mécanisme n'a pas été inventé : celui du
LOT 20 a été réemployé tel quel. Le SaaS sait désormais dire ce qu'un véhicule
coûtait le 15 septembre, préparer le coût du 1ᵉʳ octobre sans attendre, et
**refuser de calculer une marge** plutôt que d'inventer un coût de zéro.

**Un coût n'est pas un tarif.** Il vit dans sa propre table, parce que RLS ne sait
pas masquer une colonne. Un exploitant qui gère le parc, le barème, un contrat et
ses montants ne voit pas ce qu'ADIKOM paie — ni à l'écran, ni par l'API, ni par le
résolveur, ni par la résolution par lot, ni par l'export, ni par le journal, ni
dans la charge utile de la page. Et quand l'écran ne montre pas, **il le dit**.

**Une commission n'est pas une rentabilité.** Les deux indicateurs coexistent,
chacun nommé, chacun énumérant ce qu'il ne couvre pas, chacun renvoyant à l'autre.

**Et deux questions restent ouvertes, nommées, non comblées** : le coût interne
d'un véhicule ADIKOM, et celui d'un véhicule de partenariat. Aucune règle n'a été
inventée pour les remplacer — le refus lui-même porte la question.

Une recommandation du Plan 02 a par ailleurs été **écartée**, pour une raison
qu'aucun recensement ne pouvait donner : elle contredisait une décision en
vigueur. Le plan a été suivi jusqu'au point où il se heurtait au produit, et le
produit a gagné.

---

## LOT 21 — TERMINÉ

**CODE TESTÉ** — 19 contrôles de base · 61 contrôles applicatifs ·
21 tests unitaires nouveaux · 24 recettes SQL · 14 recettes applicatives ·
aucune régression

**GITHUB À JOUR** — `496fe60` sur `main`

**VERCEL À JOUR** — `496fe60`, état `READY`

**PRODUCTION VALIDÉE** — 61 + 56 + 369 + 49 + 34 contrôles contre
https://adikom-pilot.vercel.app, aucun résidu

**RAPPORT CRÉÉ** — le présent document

---

*ADIKOM PILOT — SaaS interne de gestion et de pilotage — ADIKOM Technology & Travel*
