# Rapport 12 — Catalogue de services et historisation des prix

## LOT 20 · Module 10 « Produits & Services » — Services seulement

| | |
| --- | --- |
| Date | 14 septembre 2026 |
| Lot | **LOT 20** du `Plan 02` — 2ᵉ des dix lots |
| Décision | **DEC-043** — doctrine **D16**, historisation des prix |
| Sources métier | Direction, 11/09/2026 — **A-2**, **A-8**, **A-14** · exigence **N-1** |
| Commit | **`5318918`** |
| SHA éprouvé | **`5318918`** |
| SHA déployé | **`5318918`** — déploiement Vercel `READY` |
| Production | https://adikom-pilot.vercel.app |
| Catalogue | **179 → 191 capacités** |
| Sauvegarde | **44 → 49 tables** |
| Migrations | 80 → **82** |

---

# 1. Objectif

Enregistrer les prestations qu'ADIKOM **vend**, **achète**, ou les deux — et
répondre, pour chacune, à une question que le SaaS ne savait pas poser :

> **Quel prix s'appliquait à cette date ?**

La Direction l'a écrit sans ambiguïté : *« Il ne suffit pas de conserver
uniquement le prix actuel dans la fiche du service. »* Le **Plan 01** avait
tranché l'inverse — « historique des prix : aucune table dédiée ». Ce lot
**renverse** cette position, et dit pourquoi.

Objectif second, de même poids : **le coût d'ADIKOM ne se lit pas parce qu'on
lit le service.**

---

# 2. Périmètre

## 2.1 Ce que le lot livre

- le module **Produits & Services**, code `catalog`, **Services seulement** ;
- les **catégories** de services ;
- les **services**, et leur **destination** — achat, vente, ou les deux ;
- les **variantes**, seules porteuses d'un prix ;
- les **versions datées** du prix de vente ;
- les **versions datées** du prix d'achat, dans une **table séparée** ;
- deux **résolveurs** prenant une date d'effet ;
- **douze capacités**, et pas une de plus ;
- l'écran, l'export, le journal, la sauvegarde.

## 2.2 Ce que le lot ne livre pas — et n'a pas commencé

Aucune ligne n'a été écrite sur : tarification fournisseur de véhicules,
remplacement de véhicule, segments de location, longue durée, facturation
périodique, synthèse de location, devis clients, commandes clients, devis
fournisseurs, commandes fournisseurs, caisses, sessions de caisse, ventes PDV.

**Et aucun produit** : ni table, ni capacité, ni écran (§23).

---

# 3. Décisions métier appliquées

| Réf. | Ce que la Direction a décidé | Ce que le lot en fait |
| :-: | --- | --- |
| **N-1** | Historisation réelle des prix, avec prix futurs et saisies rétroactives | **D16** : un prix est une ligne datée ; un résolveur prend une **date d'effet** |
| **A-8** | Le prix d'achat sort de la variante vers une table séparée | `service_variant_costs`, gardée par `catalog.services.cost.view` |
| **A-2** | Le tarif d'acquisition est **confidentiel** | Table séparée + policy dédiée + journal gardé par la même capacité |
| **A-14** | Permissions **indépendantes par action** | `update` n'ouvre ni `price.update` ni `cost.update` ; `price.update` n'ouvre pas `cost.view` |
| **Produits** | Module nommé « Produits & Services », **Services seulement** | Le nom est pris, la partie Produits n'existe nulle part ailleurs |

## 3.1 Réserve de lecture sur A-8 — signalée, non dissimulée

La case **« Oui » de A-8 porte une croix** sur le document rendu par la
Direction, **mais cette croix n'apparaît pas dans la couche texte du PDF**,
contrairement à celles de A-9 et des autres points : elle a probablement été
ajoutée par annotation plutôt que saisie.

Le lot traite A-8 comme **validée — Oui**, ce que le rendu montre, **et le
signale**. Le coût de l'erreur est asymétrique :

- si A-8 = Oui et qu'on ne le fait pas → le module est **à refaire** ;
- si A-8 = Non et qu'on le fait → on aura construit une table de coûts que
  personne ne remplit, **sans dégât sur le reste**.

**Un mot de confirmation de la Direction reste utile**, et il ne bloque rien.

## 3.2 🟥 P-5 — la question qui reste ouverte

> « Le prix d'achat d'un service est-il **unique**, ou peut-il **varier selon le
> fournisseur** ? »

**Aucune décision de la Direction n'y répond. Aucune règle n'a été inventée pour
combler ce vide** (`CLAUDE.md` §55).

**Ce que le lot fait** : il enregistre **un coût par variante et par période**,
sans portée fournisseur — la lecture la plus simple, et la seule qui n'ajoute
rien à ce qui a été dit.

**Ce que le lot se garde de faire** : rendre l'évolution impossible. Le jour où
la Direction répondra « par fournisseur », l'ajout est **additif** :

1. une colonne `supplier_id` **nullable** sur `service_variant_costs` ;
2. la contrainte d'exclusion étendue à cette colonne ;
3. les versions déjà saisies signifieront « coût sans fournisseur désigné » —
   ce qui sera **exact**, et n'exigera aucune reprise de données.

**Question exacte à poser** :

> « Un même service acheté auprès de deux fournisseurs différents peut-il avoir
> deux prix d'achat distincts au même moment, ou ADIKOM retient-elle un coût de
> référence unique par service ? »

**Ce point n'a bloqué aucune autre partie du lot.**

## 3.3 Une contradiction du Plan 02, nommée et arbitrée

Le Plan 02 **§7.4** exige, pour la cohérence destination / prix : *« SALE : au
moins une version de prix de vente **en vigueur** »*. Le **§5.5** du même plan
autorise expressément **un trou** entre deux versions.

Lu comme une contrainte de base, le §7.4 **contredit** le §5.5 — et rendrait
toute création impossible, un service naissant nécessairement sans prix.

**Arbitrage, consigné en DEC-043 §d**, l'énoncé se lit en deux moitiés de nature
différente :

| Moitié | Nature | Où elle est tenue |
| --- | --- | --- |
| Un prix de vente sur un service d'achat — et réciproquement | **Invariant** | **La base**, par déclencheur, y compris en appel direct |
| « Au moins un prix en vigueur » | **État d'exploitabilité** | **L'écran**, qui nomme le service sans prix applicable |

---

# 4. Analyse réalisée

Analyse **ciblée**, conformément à la consigne — aucune relecture générale du
projet. Ont été inspectés, et seulement eux :

| Surface | Ce qui en a été tiré |
| --- | --- |
| `Plan 02` §4.4, §5, §7.4, §9, §10.2, §13, §19.6 | Le périmètre exact du lot, ses tables, ses douze capacités |
| Migration 044 — `maintenance_costs` | Le patron d'une **donnée sensible en table séparée** |
| Migration 017 — `pricing_rules` / `resolve_pricing_rule` | La forme d'un **résolveur daté**, et l'événement `PRICE_CHANGE` |
| Migration 079 — LOT 19 | La forme d'**ajout d'une capacité** (`(code, module_code`), l'assertion **unique** du total |
| Migration 062 | « Une garde qui compte doit **compter la vérité** » |
| Migration 064 — `audit_detail_permission` | La **cartographie** des lectures du journal (DEC-038) |
| Migration 075 — `backup_scope()` | Le **périmètre de sauvegarde**, et `is_restoring()` |
| Migration 021 — `fn_forbid_delete` | Rien ne se supprime, sauf hors session applicative |
| `permissions.ts` · `permissions.test.ts` | La parité TS ↔ SQL, et **l'interdiction d'un total en dur** |
| `navigation.ts` · `exports/registry.ts` | Les deux registres qu'un module nouveau doit alimenter |
| `clients`, `fleet`, `pricing`, `maintenance` | Les conventions d'écran, de formulaire, de filtre et de tableau |
| `seed-demo.mjs` · `clean-demo.mjs` | Le marquage DEMO et son retrait |

**Le total `179` n'a été réintroduit nulle part.** Les recettes nomment les
capacités qu'elles éprouvent ; seule la migration 081 affirme un total, daté.

---

# 5. Documentation

| Fichier | Nature |
| --- | --- |
| `00 Documentation/03_Modules/10_Produits_et_Services.md` | **Créé** — le module, écrit **avant** le code |
| `00 Documentation/08_Decisions/01_Journal_des_Decisions.md` | **DEC-043 consignée**, index mis à jour |
| `00 Documentation/02_Architecture_Fonctionnelle/02_Navigation.md` | Addendum daté — 10ᵉ module, deux entrées, aucune « à venir » |
| `CLAUDE.md` §10 | **9 → 10 modules** — le Plan 02 §7.1 l'exigeait |

`CLAUDE.md` n'a pas été modifié pour justifier l'implémentation (§52) : il l'est
parce qu'une **décision de la Direction étend le produit**, et elle est écrite.

---

# 6. Tables créées

| Table | Rôle | Lignes portées |
| --- | --- | --- |
| `service_categories` | Classement du catalogue | code, libellé, actif |
| `services` | Identité du service | n°, libellé, catégorie, **destination**, statut, unité |
| `service_variants` | Déclinaisons | libellé, SKU, défaut, actif — **aucun prix** |
| `service_variant_prices` | **Versions datées du prix de vente** | montant, `valid_from`, `valid_to`, motif |
| `service_variant_costs` | **Versions datées du prix d'achat** | idem — **table séparée** |

**Aucune table existante n'a été modifiée.** Aucune colonne ajoutée ailleurs,
aucune donnée réinterprétée.

## 6.1 Deux énumérations nouvelles

`service_purpose` (`PURCHASE` · `SALE` · `BOTH`) et `service_status`
(`ACTIVE` · `INACTIVE` · `ARCHIVED`). Aucune énumération existante n'est
étendue : aucune migration isolée n'était donc nécessaire.

## 6.2 Contraintes structurantes

| Objet | Ce qu'il ferme |
| --- | --- |
| `exclude using gist` sur chaque table de versions | **Aucun chevauchement** entre deux versions actives — y compris entre **deux saisies simultanées**, qu'aucun déclencheur ne verrait (leçon DEC-028) |
| `check (amount > 0)` | Un prix nul ou négatif n'existe pas |
| `check (valid_to >= valid_from)` | Une période ne se referme pas avant de s'ouvrir |
| `unique (category_id, lower(label)) where status <> 'ARCHIVED'` | Deux services homonymes dans une même catégorie — sans interdire de recréer ce qui a été archivé |
| `unique (service_id) where is_default` | Une seule variante par défaut |
| `unique (lower(sku)) where sku is not null` | Une référence est une référence |

## 6.3 Numérotation

`SRV-000001`, produit par `next_number('service')` — **aucun format codé en
dur** (DEC-005). La règle est modifiable depuis le module Paramètres.

---

# 7. Permissions ajoutées — 179 → 191

| Code | Action | Sensible |
| --- | --- | :-: |
| `catalog.services.view` | VIEW | |
| `catalog.services.create` | CREATE | |
| `catalog.services.update` | UPDATE | |
| `catalog.services.archive` | ARCHIVE | |
| `catalog.services.export` | EXPORT | ✓ |
| `catalog.services.price.update` | UPDATE | ✓ |
| `catalog.services.cost.view` | VIEW | ✓ |
| `catalog.services.cost.update` | UPDATE | ✓ |
| `catalog.categories.view` | VIEW | |
| `catalog.categories.create` | CREATE | |
| `catalog.categories.update` | UPDATE | |
| `catalog.categories.archive` | ARCHIVE | |

## 7.1 Ce qui n'a **pas** été créé, et pourquoi

| Non créé | Raison |
| --- | --- |
| `catalog.products.*` | La partie Produits n'existe pas |
| `catalog.*.price.history.view` | L'historique de vente ne montre **rien de plus** que `services.view` n'ouvre déjà ; l'historique d'achat vit dans une table **déjà gardée**. Une capacité de plus ne fermerait **rien** |
| `catalog.services.margin.view` | Une marge est la différence de **deux grandeurs déjà gouvernées** |
| `catalog.categories.export` | Aucun export de catégories n'est livré |
| `catalog.*.download` / `.print` | Aucun document n'est produit par ce module |
| `catalog.*.delete` | Rien ne se supprime |

La migration **refuse elle-même** toute capacité `catalog.*` hors des douze
attendues, et la recette SQL le revérifie.

## 7.2 Les trois séparations, tenues en base

- `catalog.services.update` **n'ouvre pas** `price.update` — corriger une
  description et changer un prix ne sont pas le même geste ;
- `price.update` **n'ouvre pas** `cost.view` — fixer un prix de vente n'a jamais
  supposé de connaître le coût ;
- `catalog.services.archive` **n'est pas** `update` — le déclencheur
  `fn_service_write_guard` exige la capacité correspondant à l'acte réellement
  demandé, colonne par colonne.

## 7.3 Une capacité qui en **exige** une autre, explicitement

`cost.update` exige `catalog.services.view` **et** `cost.view`. Ce n'est pas une
inclusion implicite — c'est l'inverse : une écriture sous RLS **lit** d'abord
les lignes qu'elle vise, et un `insert … returning` exige la policy de lecture.
Sans elles, l'opération **ne modifierait rien et ne dirait rien**. Les capacités
sont donc exigées **nommément**, puis **l'effet est vérifié** (leçon DEC-046).

---

# 8. Fonctionnalités développées

## 8.1 Écrans

| Écran | Route |
| --- | --- |
| Liste des services — recherche, statut, catégorie, destination | `/catalogue/services` |
| Nouveau service | `/catalogue/services/nouveau` |
| Fiche service — trois onglets : Service · Variantes & prix · Journal | `/catalogue/services/[id]` |
| Catégories de services | `/catalogue/categories` |

**Aucun onglet « à venir », aucune entrée « Produits »** (DEC-042 §d).
Les variantes et les prix ne sont **pas** des menus : ils vivent sur la fiche.

## 8.2 Le filtre « destination » dit la vérité

Un service `BOTH` est **vendable et achetable** : il apparaît donc dans les deux
filtres. Un `eq` strict l'aurait fait disparaître des deux listes utiles, et
l'écran aurait menti.

## 8.3 Tout service naît avec sa variante

`fn_service_default_variant` pose une variante « Standard » par défaut. **Il
n'existe donc jamais de service sans variante** — aucun des modules à venir
n'aura de cas particulier à traiter. Le déclencheur s'efface pendant une
restauration, sans quoi il produirait des doublons.

## 8.4 Export

Un export : `services`. Il porte **l'identité** du catalogue et **aucun prix** —
ni de vente, ni d'achat. Deux raisons, et la seconde suffirait :

1. un prix se **résout à une date** ; le recalculer dans un classeur serait une
   **seconde implémentation** de la résolution ;
2. **un classeur circule** — il se transfère, se conserve et s'ouvre hors du
   système. Même raisonnement que pour les coordonnées bancaires fournisseurs.

---

# 9. Historisation — D16

## 9.1 Le mécanisme

```
set_service_price(variante, montant, date d'effet, motif)
        │
        ├── clôt la version courante        → valid_to = date d'effet − 1
        ├── borne la nouvelle si une version ULTÉRIEURE existe déjà
        └── ouvre la nouvelle version
```

**Aucun montant n'est jamais réécrit.** Aucune version ne se supprime : elle se
clôt, ou se **désactive** — et le motif du retrait est enregistré **à part** de
celui du changement de prix (un motif ne se réécrit pas après coup).

## 9.2 Le scénario de la Direction, éprouvé

```
50 000 KMF  jusqu'au 30/09          ← version close, montant intact
60 000 KMF  à partir du 01/10       ← saisie AVANT le 1er octobre

Opération du 15/09  →  50 000       ✔ vérifié
Opération du 15/10  →  60 000       ✔ vérifié
Opération antérieure à toute version → AUCUNE LIGNE, jamais zéro   ✔ vérifié
```

## 9.3 Le jour est comorien, pas UTC

La date d'effet par défaut des deux résolveurs s'écrit
`(now() at time zone 'Indian/Comoro')::date`. `current_date` s'évalue en UTC :
entre 21 h et minuit il désigne **la veille** à Moroni — invisible en recette de
journée, et il ferait tarifer une prestation du soir au prix de la veille le jour
d'un changement de tarif.

## 9.4 Ce que l'historisation ne fait pas

- **elle ne rejoue pas le passé** : aucune donnée existante n'est retarifée ;
- **elle ne remplace pas l'audit** : la table dit *quel prix s'applique*, le
  journal dit *qui l'a décidé* ;
- **elle n'automatise rien** : aucun ordonnanceur ne bascule un prix à minuit —
  le résolveur calcule à la lecture.

---

# 10. Sécurité et RLS

## 10.1 Trois couches, sur chaque acte

| Couche | Mécanisme |
| --- | --- |
| Interface | Filtrage de confort — **jamais une protection** |
| Action serveur | `requirePermission(…)` en première instruction |
| Base | Policies RLS + `require_capability` dans les déclencheurs et les fonctions |

`has_permission(…)` est **enveloppée dans un sous-select** dans chaque policy :
une garde de RLS s'évalue **par ligne**, et l'appel coûterait sinon un
aller-retour par ligne de la liste.

## 10.2 La garantie centrale

```sql
create policy service_variant_costs_select on public.service_variant_costs
  for select to authenticated
  using ((select public.has_permission('catalog.services.cost.view')));
```

`catalog.services.view` **n'y figure pas**, et c'est tout l'objet de la table
séparée : **RLS filtre des lignes, pas des colonnes**. Un coût rangé à côté du
libellé serait rendu par un `select` direct à quiconque lit le service.

La recette SQL **refuse** que cette policy cite `catalog.services.view`, et la
recette applicative le vérifie **avec une vraie session**.

## 10.3 Une garde qui compte, compte la vérité

Changer la destination d'un service exige de compter les versions de prix en
vigueur. Un porteur dépourvu de `cost.view` en verrait **zéro** — et pourrait,
en les ignorant, rendre « vente seule » un service qui porte des coûts, les
laissant orphelins.

`fn_service_write_guard` est donc `SECURITY DEFINER` et **compte la base**, non
ce que l'acteur peut lire. Elle **ne renvoie aucune ligne** : elle refuse, ou
laisse passer. Précédent : migration 062.

**Aucune fonction métier n'est `SECURITY DEFINER`** — les six résolveurs et
actes sont `SECURITY INVOKER`, et la migration comme la recette le vérifient
(doctrine D4). Seules le sont les **gardes** et les **fonctions d'audit**, qui
ne rendent jamais de donnée.

## 10.4 La cohérence avant l'acteur

Dans chaque déclencheur, les règles de **cohérence** sont posées **avant** tout
test de capacité. Placer le test d'acteur en tête les effacerait pour la clé de
service — donc pour une restauration ou un script (leçon migration 055).

---

# 11. Audit

| Acte | Événement | Module |
| --- | --- | --- |
| Catégorie — création, modification, archivage | `CREATE` · `UPDATE` · `STATUS_CHANGE` | `catalog` |
| Service — création, modification | `CREATE` · `UPDATE` | `catalog` |
| Service — changement de statut | `STATUS_CHANGE` **+ motif** | `catalog` |
| Variante — création, modification | `CREATE` · `UPDATE` | `catalog` |
| **Prix de vente** — toute écriture | **`PRICE_CHANGE`** | `catalog` |
| **Prix d'achat** — toute écriture | **`PRICE_CHANGE`** | `catalog` |

## 11.1 Le journal ne contourne pas la confidentialité

`audit_detail_permission` est étendue aux **cinq** objets du lot, et
`service_variant_costs` s'ouvre par **`catalog.services.cost.view`** — jamais par
`catalog.services.view`.

**Éprouvé avec un profil qui détient `users.audit.view`** : sans cela, le refus
n'aurait prouvé que son incapacité à lire le journal. Avec elle, il prouve ce qui
compte — **lire le journal n'ouvre pas le coût**, le journal **nomme** la
capacité qui manque, et le porteur de `cost.view` lit **le même** événement.

---

# 12. Sauvegarde, réinitialisation, restauration

`backup_scope()` passe de **44 à 49 tables**, des parents vers les enfants :

```
service_categories → services → service_variants
                                     ├── service_variant_prices
                                     └── service_variant_costs
```

La migration **vérifie l'ordre elle-même** : un enfant qui précéderait son parent
ferait échouer une restauration.

`TRUNCATE` est retiré à `authenticated` sur les cinq tables — il ne déclenche
aucun déclencheur de ligne et contournerait `fn_forbid_delete`.

## 12.1 Le cycle complet, éprouvé pour de vrai

`verify:backup` a **réinitialisé et restauré la base réelle** : **163 lignes**
sauvegardées, supprimées, puis restaurées **à l'identique, table par table**.

Après restauration, le catalogue était intact : **3 catégories · 3 services ·
4 variantes · 5 prix de vente · 3 prix d'achat** — et **4 variantes, non 8** :
le déclencheur de variante par défaut s'est bien effacé pendant la restauration.

---

# 13. Données de démonstration

Trois catégories, trois services — **un par destination** — et surtout **une
chronologie** :

| Service | Destination | Prix de vente | Prix d'achat |
| --- | --- | --- | --- |
| Transfert aéroport · Standard | Achat et vente | 50 000 **(échu)** → 60 000 **(en vigueur)** → 65 000 **(à venir)** | 35 000 |
| Transfert aéroport · Premium | Achat et vente | 95 000 | 62 000 |
| Excursion Itsandra | Vente | 28 000 | — *(refusé par la base)* |
| Assistance technique | Achat | — *(refusé par la base)* | 45 000 |

Le Plan 02 §19.6 l'exigeait : **une version échue et une version future**, sans
quoi l'historisation ne serait jamais éprouvée. Un seul prix par service aurait
montré un écran qui marche et n'aurait rien prouvé.

Les prix passent par **les fonctions**, jamais par un `insert` : c'est ce qui
garantit la chronologie. Le script est **idempotent** — rejoué, il ne crée aucun
doublon et ne rejoue aucune chronologie.

`demo:seed` → `demo:clean` → `demo:seed` a été exécuté **dans les deux sens** :
5 prix, 3 coûts, 4 variantes, 3 services et 3 catégories retirés, **aucun
résidu**.

---

# 14. Tests

## 14.1 Recette de base — `npm run db:verify:catalog`

**19 contrôles, tous réussis.**

| # | Ce qu'il éprouve |
| :-: | --- |
| 1 | Douze capacités, sensibilité, arborescence — et **aucune de plus** sous `catalog` |
| 2 | Cinq tables, RLS active, `DELETE` et `TRUNCATE` refermés, `anon` exclu |
| 3 | **Le prix d'achat ne s'ouvre que par `cost.view`**, et la garde est enveloppée |
| 4 | Six fonctions, **aucune `SECURITY DEFINER`**, `anon` sans exécution, **jour comorien** |
| 5 | Périmètre de sauvegarde — 49 tables, catalogue **ordonné** |
| 6 | Trois profils réels : vente sans coûts, coûts sans vente, lecture seule |
| 7 | Le service **naît avec sa variante** « Standard » |
| 8 | Une **catégorie archivée** n'accueille aucun service nouveau |
| 9 | La destination refuse le prix qui la contredit, **dans les deux sens** |
| 10 | **Le scénario de la Direction** — 50 000 / 60 000, aucune réécriture |
| 11 | **Chevauchement refusé**, trou explicite, montant nul refusé |
| 12 | Vente / coûts / lecture seule, chacun à sa place — et **rien ne se supprime** |
| 13 | **Une garde qui compte, compte la vérité** |
| 14 | Marge calculable (15 000) et **stockée nulle part** |
| 15 | Une version se **retire**, garde son motif d'origine, ne disparaît jamais |
| 16 | `PRICE_CHANGE` journalisé ; le détail d'un coût garde **sa** lecture |
| 17 | **Modifier ≠ archiver** — refusés séparément |
| 18 | Une seule variante par défaut, et elle **reste active** |
| 19 | **Aucune table de produit, de stock ni d'entrepôt** |

## 14.2 Recette applicative — `npm run verify:catalog`

**49 contrôles, tous réussis** — en local **et en production**, avec de
**vraies sessions**.

| Section | Ce qu'elle éprouve |
| --- | --- |
| 1 | Le décor monté **par l'écran** : catégorie, service, variante par défaut |
| 2 | **Le scénario de la Direction à l'écran**, puis confirmé par le résolveur |
| 3 | Le coût existe — et **le profil vente ne l'obtient par aucune voie** |
| 4 | Écritures croisées refusées, **chronologie intacte après les refus** |
| 5 | Sans la lecture : écran refusé, module absent de la barre latérale |
| 6 | Catégorie archivée retirée du choix, service existant **non déclassé** |
| 7 | L'export exige **sa** capacité — 403 sans elle, classeur avec |
| 8 | Le journal dit qui, **sans ouvrir le coût** |
| 9 | Catalogue conforme, DEMO intact, **aucune capacité de produit** |

## 14.3 Contrôles unitaires

`src/features/catalog/schema.test.ts` — **25 tests**. Notamment :

- `1500.75` est **refusé**, jamais arrondi en silence ;
- une date d'effet **future est acceptée** — c'est le besoin ;
- **aucune date de fin n'est saisie** : la base la pose ;
- une marge sans coût est **`null`**, jamais 100 % ;
- une marge **négative** est rendue telle quelle — vendre à perte est un fait.

## 14.4 Chaîne complète

| Commande | Résultat |
| --- | --- |
| `npm run lint` | ✅ |
| `npm run typecheck` | ✅ |
| `npm test` | ✅ **247 tests** (14 fichiers) |
| `npm run build` | ✅ |

---

# 15. Tests négatifs

| Tentative | Résultat |
| --- | --- |
| Lire les coûts sans `cost.view` — table, résolveur, écran, journal, export | **Aucune ligne**, par aucune voie |
| Saisir un coût avec `services.update` + `price.update` | **Refusé** — action serveur, policy et déclencheur |
| Modifier un prix de vente avec `cost.view` + `cost.update` | **Refusé** |
| **Voir** un coût pour le **saisir** | **Refusé** — lire n'est pas écrire |
| `insert` direct dans `service_variant_costs` sans capacité | **Refusé**, chronologie intacte |
| Ouvrir l'écran sans `catalog.services.view` | `/acces-refuse?requis=catalog.services.view` |
| Exporter sans `catalog.services.export` | **HTTP 403**, refus journalisé |
| Prix de vente sur un service d'**achat** | **Refusé par la base** |
| Prix d'achat sur un service de **vente** | **Refusé par la base** |
| Rendre « vente seule » un service portant des coûts, **sans les voir** | **Refusé** — la garde compte la vérité |
| Deux versions actives qui se **chevauchent** | **Refusé** par la contrainte d'exclusion |
| Montant **nul ou négatif** | **Refusé** |
| Créer un service dans une **catégorie archivée** | **Refusé** |
| **Désactiver** la variante par défaut | **Refusé** |
| **Supprimer** une version de prix, depuis une session | **Refusé** |
| Renommer un service sans `services.update` | **Refusé** |
| Archiver un service sans `services.archive` | **Refusé** |
| Archiver une catégorie sans `categories.archive` | **Refusé** |
| Lire le détail d'un coût au journal **avec `users.audit.view`** | **`may_read = false`**, capacité manquante **nommée** |

---

# 16. Non-régression

| Surface | Résultat |
| --- | --- |
| **22 recettes SQL** | ✅ toutes sans erreur |
| `verify:capabilities` | ✅ **217 contrôles** |
| `verify:backup` | ✅ **50 contrôles** — réinitialisation et restauration réelles |
| `verify:audit` | ✅ **82 contrôles** |
| `verify:groups` | ✅ **73 contrôles** |
| `verify:pilotage` | ✅ **60 contrôles** |
| `verify:customer-invoices` | ✅ **52 contrôles** |
| `verify:password-reset` | ✅ **43 contrôles** — LOT 19 intact |
| `verify:rentals` | ✅ **34 contrôles** |
| `verify:users` | ✅ **14 contrôles** |
| `verify:ajustements` | ✅ **95 contrôles** |
| `verify:responsive` | ✅ **359 contrôles**, dont les **trois écrans nouveaux** à 360, 768 et 1440 px |
| `verify:production` | ✅ **56 contrôles** |

**Aucun lot existant ne régresse.** La page publique annonce **191 capacités**,
lues en base et non recopiées.

---

# 17. Corrections rencontrées

## 17.1 `demo:clean` — un défaut **antérieur**, corrigé

Le retrait des données de démonstration comptait les lignes supprimées par
`.select('id')` après le `delete` — ce qui **exige une colonne `id`**. Quatre
tables n'en ont pas : `project_meeting_participants`,
`project_appointment_participants`, `project_members` et `notification_reads`
sont identifiées par un **couple de clés étrangères**.

Le retrait s'interrompait donc sur `column …​.id does not exist` **dès que l'une
d'elles contenait une ligne**, et laissait le jeu de démonstration **à moitié
retiré**.

**Défaut relevé au LOT 20, antérieur à lui.** Le décompte est désormais demandé à
PostgREST (`{ count: 'exact' }`), qui vaut pour toute table quelle que soit sa
clé. Le retrait complet a ensuite été exécuté de bout en bout.

## 17.2 `waitForURL` attrapait `/nouveau`

La recette attendait `**/catalogue/services/**` après la création d'un service —
motif que **`/catalogue/services/nouveau` satisfait déjà**. L'attente était donc
comblée avant l'enregistrement, et la recette repartait avec « nouveau » pour
identifiant. Remplacé par un prédicat exigeant un **véritable identifiant**.

## 17.3 Un commentaire qui refermait son propre bloc

Un commentaire de bloc contenant `**/catalogue/…` se **terminait sur le `*/`**
du motif à jokers : la suite devenait du code, et le script s'arrêtait sur
`catalogue is not defined`. Le commentaire a été réécrit en lignes.

---

# 18. Commits

| SHA | Message |
| --- | --- |
| **`5318918`** | `feat: catalogue de services et historisation datee des prix` |

**28 fichiers · 7 949 insertions.** Aucun secret, aucun artefact de
construction, `.env.local` ignoré — vérifié avant le commit.

---

# 19. Déploiement

| | |
| --- | --- |
| SHA **éprouvé** | **`5318918`** |
| SHA **déployé** | **`5318918`** |
| État Vercel | **`READY`** |
| URL | https://adikom-pilot.vercel.app |

Le sha déployé a été lu par l'API Vercel et **comparé au commit local** : la
production porte exactement le code éprouvé.

---

# 20. Recette de production

| Recette | Résultat |
| --- | --- |
| `node scripts/verify-catalog.mjs https://adikom-pilot.vercel.app` | ✅ **49 contrôles, tous réussis** |
| `node scripts/verify-production.mjs https://adikom-pilot.vercel.app` | ✅ **56 contrôles, tous réussis** |
| `node scripts/verify-responsive.mjs https://adikom-pilot.vercel.app` | ✅ **359 contrôles, tous réussis** |

**Aucun résidu** : comptes, catégories, services, variantes et prix de recette
retirés ; jeu de démonstration intact (`{clients: 6, vehicles: 8, suppliers: 4,
supplierInvoices: 3, imputations: 1}` avant comme après, 3 services DEMO
inchangés).

---

# 21. Limites

| Limite | Portée |
| --- | --- |
| **P-5 non tranchée** | Un coût par variante et par période, sans portée fournisseur. Évolution **additive** décrite au §3.2 |
| **A-8 — réserve de lecture** | La croix figure au rendu, pas dans la couche texte. Traitée comme validée, à confirmer d'un mot |
| **Export sans prix** | Volontaire (§8.4). Un export tarifaire supposerait de résoudre à une date, et de rouvrir la question du coût dans un fichier qui circule |
| **`verify:permissions`** | Non exécutée : `ADIKOM_ADMIN_USERNAME` n'est pas dans l'environnement de ce poste. Limite d'**environnement**, antérieure au lot |
| **`verify:responsive` intermittente** | Échec de connexion ponctuel contre la production (`button[type="submit"]` + `waitForURL` sans reprise). Réussie au passage suivant, **359 contrôles**. Défaut de recette antérieur, non corrigé ici pour ne pas élargir le lot |

---

# 22. Ce qui n'a PAS été développé

**Rien de ce que la consigne interdit n'a été touché** :

❌ tarification fournisseur de véhicules · ❌ remplacement de véhicule ·
❌ segments de location · ❌ longue durée · ❌ facturation périodique ·
❌ synthèse de fin de location · ❌ devis clients · ❌ commandes clients ·
❌ devis fournisseurs · ❌ commandes fournisseurs · ❌ caisse ·
❌ session de caisse · ❌ PDV · ❌ **produits**

Et par ailleurs :

- **aucune refonte** — le Design System, les composants et les écrans existants
  sont inchangés ;
- **aucune permission existante modifiée** — le catalogue s'allonge, il ne se
  réécrit pas ;
- **aucune table existante modifiée**, aucune colonne ajoutée ailleurs ;
- **aucune suppression physique** ;
- **`commercial_line_costs`** — la table du Plan 02 §9.3 n'est **pas** créée :
  elle appartient au **LOT 28**, et aucune ligne commerciale n'existe encore.
  Une table sans consommateur serait de la surconstruction ;
- **aucune capacité de marge, d'historique ou de produit.**

---

# 23. Conclusion

Le LOT 20 pose le **socle** que quatre lots attendent, et il le pose sur une
doctrine plutôt que sur un écran.

**Un prix n'est plus une colonne.** C'est une ligne datée, qu'un résolveur lit à
une date d'effet. Le SaaS sait désormais répondre à « quel prix s'appliquait le
15 septembre ? », préparer le prix du 1ᵉʳ octobre sans attendre le 1ᵉʳ octobre, et
refuser de facturer plutôt que d'inventer un montant quand aucune version ne
s'applique.

**Un coût n'est pas un prix.** Il vit dans sa propre table, parce que RLS ne sait
pas masquer une colonne. Un utilisateur qui vend un service ne voit pas ce qu'il
a coûté — ni à l'écran, ni par l'API, ni par le résolveur, ni par l'export, ni
par le journal. Et quand l'écran ne montre pas, **il le dit**.

**Une destination se déclare.** Elle ne se devine pas d'un prix, et la base
refuse le prix qui la contredit — dans les deux sens.

Une question reste ouverte, **nommée, non comblée** : P-5. Aucune règle n'a été
inventée pour la remplacer, et l'architecture reste ouverte à la réponse.

---

## LOT 20 — TERMINÉ

**CODE TESTÉ** — 19 contrôles de base · 49 contrôles applicatifs ·
25 tests unitaires · 22 recettes SQL · 13 recettes applicatives · aucune
régression

**GITHUB À JOUR** — `5318918` sur `main`

**VERCEL À JOUR** — `5318918`, état `READY`

**PRODUCTION VALIDÉE** — 49 + 56 + 359 contrôles contre
https://adikom-pilot.vercel.app, aucun résidu

**RAPPORT CRÉÉ** — le présent document

---

*ADIKOM PILOT — SaaS interne de gestion et de pilotage — ADIKOM Technology & Travel*
