# Rapport 14 — Avenants, segments de location et remplacement de véhicule

## LOT 22 · Module 05 « Gestion de location » — Le contrat ne change plus d'identité

| | |
| --- | --- |
| Date | **18 → 22 septembre 2026** — développement le 18, recette de production achevée le 22 |
| Lot | **LOT 22** du `Plan 02` — 4ᵉ des dix lots, et celui que le plan désigne comme **le plus risqué** (Plan 02 §15.1) |
| Décision | **DEC-045** — réservée par le journal à ce lot, aujourd'hui consignée |
| Sources métier | Direction, 11/09/2026 — **A-3**, **A-4**, **A-5**, **A-7**, **A-14** |
| Commits | **`8cea7df`** (le lot) · **`f0d70f2`** (deux défauts trouvés par les recettes) |
| SHA **éprouvé et déployé** | **`f0d70f2`** — déploiement Vercel `READY` |
| Production | https://adikom-pilot.vercel.app |
| Catalogue | **195 → 196 capacités** |
| Sauvegarde | **50 → 53 tables** |
| Migrations | 86 → **93** |

---

# 1. Objectif

Le SaaS savait tenir un contrat de location avec **un** véhicule. Il ne savait
pas ce qui se passe quand ce véhicule tombe en panne au milieu de la location.

Le cas, écrit par la Direction :

```
Contrat            01/09 → 10/09        véhicule A, 50 000 KMF/jour
Panne au 05/09     ADIKOM fournit B
```

Et la réponse de la Direction à la question « faut-il un nouveau contrat ? » :

> **A-4 — « On garde le même contrat et on rajoute des avenants. »**

C'est la règle centrale du lot. Le contrat garde son identifiant, son client, sa
réservation d'origine. Ce qui change est consigné par un **avenant** ; ce qui en
résulte vit dans une **période**.

---

# 2. Décisions de la Direction appliquées

| Réf. | Ce que la Direction a décidé | Ce que le lot en fait |
| :-: | --- | --- |
| **A-4** | « On garde le même contrat et on rajoute des avenants » | Aucun contrat n'est créé. `rental_amendments` porte l'acte, `rental_segments` ses effets. L'identifiant, le client et le tarif initial sont intacts |
| **A-5** | « Le client paie le nouveau tarif » ✓ · « décision au cas par cas » ✓ | Le barème s'applique par défaut ; une **dérogation** exige `rental.pricing.override` **et une raison écrite**, journalisée `PRICE_CHANGE` |
| **A-3** | « ADIKOM est un fournisseur » | **Un seul mécanisme** de coût pour tous les véhicules — aucun second système, aucune fiche fournisseur « ADIKOM ». Ce que la décision ne dit pas reste ouvert (§12.1) |
| **A-7** | Changement de tarif possible ; pénalités de 20 à 100 % | **Le moyen est livré, pas le barème** : un changement de tarif se représente, se motive, s'historise. **Aucun pourcentage n'est calculé** (§12.3) |
| **A-14** | Permissions indépendantes par action | `swap` n'ouvre pas `override`, et réciproquement. Un avenant qui fait les deux exige **les deux** |

---

# 3. Périmètre

## 3.1 Ce que le lot livre

- trois tables — **`rental_amendments`**, **`rental_segments`**,
  **`rental_segment_costs`** ;
- une colonne sur `vehicle_occupations` : **une occupation par période** ;
- deux **actes** — remplacer le véhicule, forcer le tarif ;
- **une** capacité nouvelle, et une capacité **dormante enfin employée** ;
- l'onglet **Chronologie** d'un contrat, avec ses deux formulaires ;
- le **quatrième document** du cycle : l'avenant, imprimable et téléchargeable ;
- la **reprise** de toutes les locations existantes en périodes ;
- le **gel du coût** — l'écart que le LOT 21 avait nommé, fermé ;
- les cinq fonctions du cycle **reprises** pour suivre les périodes ;
- la sauvegarde, le journal, le jeu de démonstration, les recettes.

## 3.2 Ce que le lot ne livre pas

❌ facturation périodique · ❌ périodes facturables · ❌ pénalités ·
❌ synthèse de location · ❌ devis et commandes · ❌ PDV ·
❌ facturation des services · ❌ résolution de P-5 ·
❌ contrainte d'exclusion sur `pricing_rules`

**Et aucune refonte** : `pricing_rules` n'est pas touchée, `service_variant_costs`
non plus, aucun système parallèle de facture ou de trésorerie n'existe, et
*imputation fournisseur ≠ paiement fournisseur* reste entier.

---

# 4. Architecture

## 4.1 L'acte et ses conséquences

```
rental_amendments        L'ACTE   — n°, nature, date d'effet, motif, auteur
      │                  C'est ce que la Direction appelle « avenant »
      └──▶ rental_segments        LA CONSÉQUENCE — véhicule, période, tarif
                  │                verrouillé
                  └──▶ rental_segment_costs   LE COÛT GELÉ — confidentiel
```

**Le type dit l'acte, les périodes disent ses effets.** Un avenant qui change de
véhicule *et* de tarif reste UN avenant : c'est sa période qui porte le nouveau
montant. Aucun tableau de « types multiples » n'a été créé.

## 4.2 🟥 Trois tables là où le Plan 02 en annonçait deux

Le plan prévoyait le coût en colonnes `locked_cost_*` sur le segment. Il y en a
trois, pour la raison même qui avait commandé la table séparée du LOT 21 :

> **RLS filtre des LIGNES, pas des COLONNES.**

`rental_segments` s'ouvre par `rental.rentals.view` — il **faut** qu'un
exploitant voie quel véhicule a servi et quand. Un coût rangé sur le segment
serait rendu par le même `select`, et la confidentialité du LOT 21 serait
contournée **par la porte du contrat**.

## 4.3 🟥 Pas de `rentals.current_segment_id`

Le Plan 02 §9.2 le prévoyait, « pour éviter une sous-requête ». Il n'a pas été
créé : l'index unique partiel `unique (rental_id) where status = 'ACTIVE'` fait
déjà de « la période ouverte » **une seule ligne, trouvée par index**. Une
colonne redondante serait une **seconde vérité** qu'un déclencheur devrait tenir
à jour — et qui finirait par diverger (doctrine D1).

## 4.4 La convention temporelle, arrêtée et écrite

Les périodes sont des `tstzrange` **semi-ouverts** `[début, fin)` — c'est déjà la
convention de `vehicle_occupations` et de `rentals.planned_period`.

```
Véhicule A   [ 01/09 00:00 , 05/09 08:00 )   ← 05/09 08:00 n'en fait PAS partie
Véhicule B   [ 05/09 08:00 , 10/09 00:00 )   ← 05/09 08:00 lui appartient
```

**L'instant de bascule appartient à la période suivante, et à elle seule.**
Aucune journée comptée deux fois, aucune manquante. La recette le vérifie par
`lower_inc` / `upper_inc` et par `@>`, non par lecture.

## 4.5 La règle temporelle du remplacement

| Situation | Ce que la base exige |
| --- | --- |
| Toujours | La bascule tombe **dans** la période ouverte |
| Bascule au **début**, contrat non parti | La période est **ANNULÉE** — le véhicule n'a jamais été remis — et la nouvelle reprend sa période entière |
| Contrat **parti** | La bascule est **postérieure au départ réel** et **non postérieure à maintenant** : on CONSTATE un changement survenu, on ne le programme pas sur un véhicule dehors |
| Sinon | La période est **close** à cet instant, la suivante part de là |

---

# 5. Tables créées

| Table | Rôle | Lignes portées |
| --- | --- | --- |
| `rental_amendments` | **L'avenant** — l'acte | n°, rang, nature, date d'effet, motif, dérogation et sa raison, auteur |
| `rental_segments` | **La période** | véhicule, rang, période, statut, tarif client verrouillé, avenant d'origine |
| `rental_segment_costs` | **Le coût gelé** | montant, unité, fournisseur, version de tarif, date de résolution |

**Une seule colonne ajoutée à une table existante** :
`vehicle_occupations.rental_segment_id`, nullable. Aucune donnée existante n'est
modifiée.

## 5.1 Ce que la base garantit seule

| Garantie | Comment |
| --- | --- |
| Deux périodes d'un contrat **ne se recouvrent pas** | `exclude using gist (rental_id, period) where status <> 'CANCELLED'` |
| Un contrat n'a **qu'une** période ouverte | `unique (rental_id) where status = 'ACTIVE'` |
| **Aucun trou** : le contrat n'est jamais sans véhicule | Contrôle de contiguïté : `lower(new) = upper(précédente)` |
| Un véhicule n'est pas engagé **deux fois** | `vehicle_occupations`, contrainte existante |
| Une période **ne réécrit** ni son véhicule, ni son tarif, ni son début | `fn_rental_segment_guard` |
| Un avenant **ne se modifie pas** | Le **droit** `UPDATE` est retiré, pas seulement la policy |
| Un coût gelé **ne se dégèle pas** | `fn_rental_segment_cost_immutable` |
| Une **exception** tarifaire porte sa raison | `check (not rate_override or rate_override_reason is not null)` |
| Le véhicule d'une location ne change **que** par avenant | `fn_rental_vehicle_follows_segment` |
| Rien ne se **supprime** | `fn_forbid_delete` sur les trois tables, `DELETE` et `TRUNCATE` retirés |

## 5.2 Une garde qui ne s'appuie sur aucun contexte de session

`fn_rental_vehicle_follows_segment` refuse tout changement de
`rentals.vehicle_id` qui ne suive pas la période ouverte. Elle ne s'appuie
**sur aucun réglage de session** : la leçon de `admin_restore_backup` est qu'un
contexte qui lève une garde survit au `return` de la fonction qui l'ouvre. Elle
s'appuie sur **la donnée** — l'acte du lot insère la période **avant** de déplacer
le véhicule ; une écriture directe, elle, n'a aucune période à présenter.

Et la cohérence passe **avant** l'acteur (migration 055) : **même la clé de
service** est refusée, ce que la recette éprouve.

---

# 6. Le coût gelé — l'écart de DEC-044, fermé

Le LOT 21 s'était arrêté à une limite qu'il avait nommée :

> « Une version ouverte **délibérément** à une date d'effet passée modifie la
> commission affichée des contrats de cette période. `locked_cost_*` fermera ce
> dernier écart au LOT 22. »

## 6.1 Quand le coût est gelé, et pourquoi là

**À l'ouverture d'une période — donc à l'ENGAGEMENT, et jamais avant.** Le coût
applicable **à la date métier de la période** est résolu une fois, puis figé.

| Ce qui reste corrigible | Ce qui ne l'est plus |
| --- | --- |
| Les **versions** de tarif fournisseur — elles se closent, s'ouvrent, se retirent | Le **coût gelé** d'une période : ni modifié, ni supprimé |
| Elles gouvernent les périodes **à venir** | Elles n'atteignent plus celles qui sont **engagées** |

## 6.2 Le gel est une CONSÉQUENCE, jamais un acte

C'est le point de conception du lot.

L'exploitant qui remplace un véhicule **n'a pas** — et ne doit pas avoir — la
capacité de lire le coût fournisseur (A-2). Si le gel dépendait de ce qu'il peut
lire, le coût serait **perdu** chaque fois qu'il agit, et un lecteur autorisé
constaterait plus tard un trou qu'il prendrait pour une absence de coût.

Le gel est donc écrit par la base — un déclencheur `after insert`, `SECURITY
DEFINER`, qui **ne renvoie rien** et dont la ligne reste derrière
`rental.pricing.supplier.view`. Ce n'est **pas** un contournement de droit
métier : personne n'obtient par là une lecture qu'il n'avait pas. Les deux
**actes** du lot, eux, sont `SECURITY INVOKER`, et la migration comme la recette
le vérifient (doctrine D4).

## 6.3 Éprouvé sur le vrai chemin

```
Coût de B gelé à l'ouverture de la période            45 000
Version RÉTROACTIVE ouverte ensuite, date passée      99 000
resolve_supplier_rate à la date de la période      →  99 000   ✔ le résolveur suit
rental_segment_costs de la période                 →  45 000   ✔ le gel tient
UPDATE direct sur le coût gelé                     →  REFUSÉ
```

---

# 7. Permissions — 195 → 196

| Code | Action | Sensible | Ce qu'elle ouvre |
| --- | --- | :-: | --- |
| `rental.rentals.swap` | UPDATE | ✓ | **Remplacer le véhicule** d'une location par avenant |

**Une seule.** Et une capacité **dormante trouve enfin son emploi** :
`rental.pricing.override` — « Forcer un tarif manuellement » — était au catalogue
depuis le premier jour et n'ouvrait **rien** (Plan 02 §1.4, `CLAUDE.md` §19 bis).
Elle gouverne désormais la dérogation tarifaire. **Aucune capacité nouvelle n'a
été créée pour A-5** : le catalogue se corrige au lieu de s'allonger.

## 7.1 Ce qui n'a PAS été créé, et pourquoi

| Non créé | Raison |
| --- | --- |
| `rental.rentals.amendments.view` | Les avenants et les périodes sont **l'histoire du contrat** : quel véhicule, quand, à quel tarif. Qui a le droit de consulter une location a le droit de savoir quel véhicule elle a mobilisé. Une capacité de plus ne fermerait qu'un **onglet** — et une permission qui ne fait que masquer une carte n'en est pas une (DEC-036 §d, DEC-042 §d) |
| `…amendments.create` | C'est `swap` (véhicule) ou `pricing.override` (tarif) |
| `…amendments.update` | Un avenant **ne se modifie pas**. Pas de fonctionnalité, pas de permission |
| `…amendments.export` | Aucun export n'est livré, et `rental.rentals.export` porte déjà la liste |
| `.download` / `.print` propres | L'avenant est le **4ᵉ document du cycle**, sous `rental.rentals.download` / `.print` — exactement le raisonnement du Plan 02 §10.3 pour la synthèse |
| `rental.rentals.rate.override` | `rental.pricing.override` **existe** (Plan 02 §10.3) |
| Toute capacité de commission ou de marge | Une commission est la différence de **deux grandeurs déjà gouvernées**. Une capacité de plus ne fermerait **rien** (Rapport 13 §10.2) |
| `rental.rentals.penalty.*` | **A-7 n'est pas tranchée.** La fonctionnalité n'existe pas |

La migration **refuse elle-même** toute capacité `rental.rentals.amendment*`,
`…segment*`, `…penalty*`, `…rate.*` ou `*.commission.*`, et la recette le
revérifie.

## 7.2 Les séparations, tenues en base

- **`rental.rentals.update` n'ouvre pas `swap`** — corriger une note et
  substituer un véhicule ne sont pas le même geste ;
- **`swap` n'ouvre pas `pricing.override`** — substituer un véhicule n'a jamais
  supposé le droit de s'écarter du barème. Éprouvé **dans les deux sens** ;
- **`rental.rentals.view` n'ouvre pas le coût gelé** — ni par la table, ni par la
  jointure, ni par l'écran, ni par la charge utile de la page.

---

# 8. Sécurité et RLS

## 8.1 Trois couches, sur chaque acte

| Couche | Mécanisme |
| --- | --- |
| Interface | Filtrage de confort — **jamais une protection** |
| Action serveur | `requirePermission(…)` en première instruction |
| Base | Policies RLS + `require_capability` dans les gardes et les actes |

`has_permission(…)` est **enveloppée dans un sous-select** dans chaque policy
nouvelle : une garde de RLS s'évalue **par ligne** (migration 065).

## 8.2 La garantie centrale du lot

```sql
create policy rental_segment_costs_select on public.rental_segment_costs
  for select to authenticated
  using ((select public.has_permission('rental.pricing.supplier.view')));
```

`rental.rentals.view`, `rental.rentals.financial.view`, `rental.fleet.view` et
`rental.pricing.view` **n'y figurent pas**. La migration refuse elle-même que
cette policy les cite ; la recette SQL le revérifie ; la recette applicative le
vérifie **avec de vraies sessions**.

Et le coût gelé n'a **aucune policy d'écriture** : les droits `INSERT` et
`UPDATE` sont retirés à `authenticated`. Seule la base l'écrit — la forme la plus
forte de l'immuabilité.

## 8.3 Les policies élargies, et rien de plus

| Policy | Ce qui s'ajoute | Pourquoi |
| --- | --- | --- |
| `vehicle_occupations_insert` / `_update` | `swap`, `override` | Le remplacement **pose** une occupation et en **libère** une |
| `fn_occupation_capability` | idem, sur la seule branche `RENTAL` | Sans cela, il faudrait `rental.rentals.create` pour **modifier** un contrat — l'inverse de A-14 |
| `rentals_update` | `swap`, `override` | Le véhicule courant suit la période ouverte |
| `vehicles_update` | `swap` | L'ancien véhicule revient au parc, le nouveau part |

---

# 9. Audit

| Acte | Événement | Module |
| --- | --- | --- |
| Avenant — création | **`CREATE`** | `rental` |
| Avenant portant une **dérogation tarifaire** | **`PRICE_CHANGE`** | `rental` |
| Période — ouverture, clôture, annulation | `CREATE` / `UPDATE` / `STATUS_CHANGE` | `rental` |
| Coût gelé | **`PRICE_CHANGE`** | `rental` |
| Véhicule courant du contrat | `UPDATE`, avec l'**avant / après** | `rental` |

Les fonctions d'audit des LOTS antérieurs sont **réemployées** : aucune fonction
d'audit nouvelle. Un avenant ordinaire n'écrit **pas** de `PRICE_CHANGE` — la
clause `when (new.rate_override)` l'en empêche, et la recette le vérifie.

## 9.1 Le journal ne contourne pas la confidentialité

`audit_detail_permission` est étendue :

| Objet | S'ouvre par |
| --- | --- |
| `rental_amendments` · `rental_segments` | `rental.rentals.view` |
| **`rental_segment_costs`** | **`rental.pricing.supplier.view`** |

Les acquis des LOTS 20 et 21 sont revérifiés par la migration : la fonction étant
réécrite en entier, une omission se lirait comme une suppression silencieuse.

---

# 10. Fonctionnalités développées

## 10.1 L'onglet « Chronologie »

| Ce qui s'y lit | Capacité |
| --- | --- |
| Les périodes, leurs véhicules, leurs dates, leur état | `rental.rentals.view` |
| Le tarif client de chaque période, et **l'écart** avec la précédente | `rental.rentals.financial.view` |
| Le **coût gelé** et la **commission** de chaque période | `rental.pricing.supplier.view` |
| Les avenants : nature, date d'effet, motif, dérogation, auteur | `rental.rentals.view` |

**L'onglet est toujours présent**, même pour un contrat qui n'a jamais changé de
véhicule : montrer qu'il existe apprend au lecteur que cette lecture existe. Ne
l'afficher qu'au deuxième véhicule en ferait une surprise, le jour où l'on en a
le plus besoin.

**Chaque bloc disparaît entièrement sans sa capacité** : aucun bouton désactivé,
aucune carte vide qui se lirait « il n'y a rien » (DEC-017).

## 10.2 On nomme l'acte avant de le décrire

Deux boutons — « Remplacer le véhicule », « Changer le tarif » — et **un seul
formulaire monté à la fois**. Ce n'est pas un choix d'esthétique : les deux
formulaires portent des champs de **même nom** — date d'effet, tarif, unité,
motif. Montés ensemble, ils produiraient deux contrôles du même identifiant, et
le `<label>` du second désignerait le premier.

C'est aussi ce que le métier fait : on remplace un véhicule, **ou** on change un
tarif, jamais les deux d'un même geste.

## 10.3 Un refus ne coûte pas la saisie

Les champs des deux formulaires sont **pilotés**. React 19 remet à zéro les
champs non pilotés dès que l'action s'achève — **y compris sur un refus**. Un
exploitant qui choisit un véhicule, une date, écrit son motif, coche la
dérogation, saisit un montant, puis oublie la raison de la dérogation perdrait
les six champs pour un seul manquant.

Le défaut a été **trouvé par la recette** : le second envoi partait avec des
champs vides, et l'écran ne disait ni succès ni erreur.

## 10.4 A-5 à l'écran

```
◉ Appliquer le tarif du nouveau véhicule      ← le défaut, le cas ordinaire
○ Appliquer un tarif dérogatoire              ← proposé SEULEMENT avec `override`
      ↳ Tarif · Unité · RAISON (obligatoire)
```

Sans `rental.pricing.override`, l'écran **dit** pourquoi la dérogation n'est pas
proposée, plutôt que de la taire.

## 10.5 A-7 à l'écran — ce qui n'y est pas

**Aucun bouton « +20 % », aucun sélecteur de pénalité, aucun champ de
pourcentage.** Le montant est **saisi** et motivé, et l'écran écrit pourquoi :
la base du pourcentage, le taux et la nature de la majoration ne sont pas arrêtés.
Inventer un barème serait inventer une règle métier (`CLAUDE.md` §55).

## 10.6 Les commissions par période, et le total qui n'en est pas

```
Période 1   50 000 client − 40 000 coût  =  10 000 KMF/jour
Période 2   60 000 client − 45 000 coût  =  15 000 KMF/jour
```

**Aucun total.** Additionner 10 000 et 15 000 KMF/**jour** ne donne pas 25 000 :
il faudrait pondérer chaque période par sa **durée facturable**, dont la règle
d'arrondi n'est pas arrêtée (DEC-008). L'écran donne la commission de chaque
période **et dit pourquoi il n'en fait pas la somme** — plutôt que de produire un
total qui aurait l'air juste.

## 10.7 Le quatrième document du cycle

L'**avenant** rejoint le contrat, le bon de départ et le PV de retour. Chaque
avenant a **sa** pièce — « imprimer l'avenant n° 2 » désigne le n° 2.

Il porte, pour le client : le contrat d'origine **nommé comme inchangé**, l'acte
et son motif, l'**avant / après** du véhicule et du tarif, la raison de la
dérogation lorsqu'il y en a une, et la chronologie complète.

Le **contrat** lui-même gagne un tableau des périodes successives, qui ne paraît
qu'**à partir de deux** : pour un contrat inchangé, il répéterait ce qui précède.

## 10.8 🟥 La confidentialité du PDF est portée par le TYPE

Les modèles documentaires ne reçoivent **pas** le segment, mais un
`ContractPeriod` — un type qui **ne porte pas** le coût gelé. Un modèle ne peut
pas révéler ce qu'il ne reçoit pas, même pour un Super Admin qui aurait le droit
de lire ce coût. C'est la troisième barrière du Plan 02 §6.3, portée par le
typage plutôt que par la vigilance.

`src/lib/documents/document.test.ts` relit les sources et refuse désormais aussi
`rental_segment_costs`, `lockedCost` et `segmentCommission`.

---

# 11. La reprise des locations existantes

**La seule migration de données réellement risquée du plan** (Plan 02 §16.2).

| Garantie exigée | Tenue |
| --- | --- |
| Schéma et données en **migrations séparées** | 087 pose, 088 remplit — rejouables séparément |
| **Sauvegarde** avant application | ⚠ **Non tenue à la lettre** — voir §23. Le mécanisme a en revanche été éprouvé **après** le lot : `verify:backup` a produit, réinitialisé et restauré la base réelle, périodes et coûts gelés compris |
| **Comptage** : une période par location, aucune location sans | La migration **refuse de s'appliquer** si le compte ne tombe pas |
| **Aucune valeur recalculée** | `locked_*` copiés depuis `rentals`, comparés colonne par colonne |
| **Réversibilité documentée** | Trois `delete` avec la clé de service, écrits dans la migration |

## 11.1 D'où vient la période

De **l'occupation** de la location — c'est-à-dire de l'engagement réellement tenu
par le calendrier, celui que `convert`, `start`, `extend` et `return` ont déjà
déplacé au fil du cycle. À défaut, de la période prévue, étendue au retour
attendu lorsqu'une prolongation l'a dépassée.

## 11.2 ⚠ Un écart assumé avec le Plan 02 §19.2

Le plan écrivait `locked_cost_* = NULL`, « aucun coût n'existait alors ». **Ce
n'est plus vrai** : le LOT 21 a livré des coûts **datés**. Le gel interroge le
résolveur **à la date de la période**, non à celle d'aujourd'hui.

Le coût gelé d'une location d'août est donc **celui d'août** — exactement le
montant que sa fiche affichait déjà. Rien n'est réinterprété ; **ce qui était
affiché est désormais protégé**.

---

# 12. 🟥 Ce que le lot NE tranche PAS

## 12.1 P-2 — le coût interne d'un véhicule ADIKOM

**A-3 est appliquée là où elle porte** : un seul mécanisme de coût pour tous les
véhicules, une seule table de versions, un seul résolveur, une seule table de
coût gelé. **Aucune fiche fournisseur « ADIKOM » n'a été créée**, aucune origine
de véhicule n'a été déplacée, et `vehicles_origin_attachment_coherent` est
intacte — la migration le vérifie.

Mais A-3 **ne dit toujours pas** ce qu'EST ce coût :

> **(a)** un tarif de référence fixé par la Direction, ou **(b)** un coût de
> revient calculé — amortissement, assurance, entretien ?

**(b)** reste impossible : aucune de ces charges n'est enregistrée par véhicule.
Tant que la réponse manque, un véhicule ADIKOM n'a **aucun coût enregistrable** :
sa période n'a pas de coût gelé, sa commission n'est **pas calculée**, et l'écran
dit pourquoi.

## 12.2 🟥 Le véhicule de partenariat

**Aucune décision n'existe.** Le document de validation fourni n'en parle pas, et
le lot ne lui invente rien. Son coût est absent, sa commission non calculée, et
le message est **distinct** de celui de P-2 — les confondre ferait passer deux
questions différentes pour une seule.

La démonstration le montre : la seconde période de `LOC-2026-000368` porte un
véhicule de partenariat, et sa commission n'est pas calculée.

## 12.3 🟥 A-7 — les pénalités

Ce qui est écrit : « des pénalités de 20 à 100 % ». Ce qui manque : **de quoi**
elles se calculent, **qui** fixe le taux, et s'il s'agit d'une **majoration du
tarif** ou d'une **ligne de facture distincte**.

Le LOT 22 livre **le modèle** : un changement de tarif se représente, se motive,
s'historise, s'audite. Il ne livre **aucun barème**, **aucun champ de
pourcentage**, **aucune capacité de pénalité**. L'avenant de **prolongation** est
refusé et le refus **nomme le LOT 23**.

## 12.4 🟥 Le Plan 02 §5.7 reste écarté

`pricing_rules` n'est pas touchée — ni colonne, ni contrainte, ni donnée. La
migration **refuse** qu'une contrainte d'exclusion y soit posée, la recette du
lot revérifie que **DEC-002 départage encore par la date de création**, et
`supabase/tests/location.sql` se rejoue **sans modification**.

## 12.5 P-5 · A-8

**A-8 est acquis du LOT 20** et n'a pas été rediscuté. **P-5 reste ouvert** :
`service_variant_costs` n'a reçu **aucune colonne `supplier_id`**.

---

# 13. Tests

## 13.1 Recette de base — `npm run db:verify:amendments`

**25 contrôles, tous réussis.**

| # | Ce qu'il éprouve |
| :-: | --- |
| 1 | Une capacité, sensible, bien placée — **et aucune de plus** |
| 2 | Trois tables, RLS active, suppression et TRUNCATE refermés, `anon` exclu |
| 3 | **Le coût gelé ne s'ouvre QUE par sa capacité** ; la période se lit avec le contrat |
| 4 | Deux actes en `SECURITY INVOKER`, quatre gardes en DEFINER, **jour comorien**, résolveurs **délégués** |
| 5 | Périmètre de sauvegarde : 53 tables, **dans l'ordre**, paire par paire |
| 6 | Quatre profils réels : exploitation **sans** coût ni dérogation, avenant, coûts, lecture seule |
| 7 | Décor : 3 véhicules fournis, tarifs 50 000 / 60 000 / 55 000, coûts 40 000 / 45 000 |
| 8 | 🟩 **Le cas de la Direction** : même contrat, un avenant, deux périodes contiguës |
| 9 | Ancien tarif **conservé**, nouveau appliqué, source du barème |
| 10 | Coûts gelés 40 000 / 45 000 ; commissions **10 000 / 15 000**, stockées nulle part |
| 11 | 🟥 Une saisie **rétroactive** déplace le résolveur et **laisse** le coût gelé |
| 12 | 🟩 A-5 : `swap` seul refuse la dérogation ; sans raison elle est refusée ; accordée, elle est tracée et journalisée `PRICE_CHANGE` |
| 13 | Recouvrement, **trou**, rang incohérent, véhicule identique : quatre refus |
| 14 | Un véhicule **déjà occupé** est refusé, sans laisser ni période ni avenant |
| 15 | 🟥 **La prolongation n'allonge QUE la période ouverte** |
| 16 | Le retour clôt la période ouverte à la date réelle, et ferme l'avenant |
| 17 | Six refus : rien ne se supprime, un avenant ne se réécrit pas |
| 18 | Le véhicule d'une location ne se change qu'en suivant sa période — **clé de service comprise** |
| 19 | 🟥 `pricing_rules` intacte ; **DEC-002 départage toujours** |
| 20 | Toutes les locations segmentées ; chaque occupation nomme sa période |
| 21 | 🟥 L'avenant de **prolongation** est refusé et nomme le LOT 23 |
| 22 | 🟩 Le changement de tarif seul : refusé sans `override`, refusé sans motif, accepté motivé |
| 23 | Une location **annulée** voit sa période ANNULÉE, son véhicule libéré, sa trace conservée |
| 24 | Le journal n'ouvre pas ce que les tables ferment |
| 25 | La convention `[début, fin)` tenue : la bascule appartient à la période **suivante** |

## 13.2 Recette applicative — `npm run verify:amendments`

**74 contrôles, tous réussis** — en local **et en production**, avec de **vraies
sessions** : jeton Supabase, cookie applicatif, appels PostgREST directs,
documents PDF.

| Section | Ce qu'elle éprouve |
| :-: | --- |
| 1 | Le décor, et **le coût gelé dès l'engagement** — par un compte qui ne peut pas le lire |
| 2 | Ce que **chaque profil** voit de la chronologie — quatre profils, quatre lectures |
| 3 | 🟩 **Le cas de la Direction, monté PAR L'ÉCRAN** : même contrat, deux périodes, calendrier et statuts de véhicules |
| 4 | Les deux commissions ; et **l'exploitant n'obtient le coût par aucune voie** — table, jointure, écran, charge utile |
| 5 | 🟩 L'exception : `swap` seul refusé, sans raison refusée, accordée tracée et journalisée |
| 6 | 🟥 Le coût gelé **ne bouge plus** après une saisie rétroactive |
| 7 | Cinq refus, et **aucune trace partielle** |
| 8 | Les documents : contrat et **avenant**, et 403 sans la capacité |
| 9 | Catalogue conforme, barème réel intact, jeu DEMO intact, **aucune erreur de console** |

## 13.3 Contrôles unitaires

`src/features/amendments/schema.test.ts` — **21 tests**. Notamment :

- sans montant, le tarif est `null` — **jamais 0** : « applique le barème » n'est
  pas « le client ne paie rien » ;
- un tarif dérogatoire **sans raison** est refusé, au niveau du champ ;
- une raison **sans tarif** est refusée : elle ne motiverait rien ;
- `50000,75` est refusé, jamais arrondi en silence ;
- un tarif **nul** accompagné de sa raison est accepté — une gratuité consentie
  est un tarif ;
- le schéma de tarif **n'expose aucun champ** de pénalité ni de pourcentage ;
- un instant de 22 h 30 UTC est daté du **lendemain** à Moroni.

`src/lib/documents/document.test.ts` — **8 tests nouveaux** : l'avenant rendu
dans quatre états, le contrat segmenté dans trois, et le contrôle structurel
étendu à trois termes du domaine du coût.

## 13.4 Chaîne complète

| Commande | Résultat |
| --- | --- |
| `npm run lint` | ✅ |
| `npm run typecheck` | ✅ |
| `npm test` | ✅ **294 tests** (16 fichiers) |
| `npm run build` | ✅ |

---

# 14. Tests négatifs

| Tentative | Résultat |
| --- | --- |
| Lire le coût gelé sans `supplier.view` — table, jointure, écran, charge utile | **Aucune ligne**, par aucune voie |
| Forcer un tarif avec `swap` **seul** | **Refusé** — `insufficient_privilege` |
| Dérogation **sans raison écrite** | **Refusée**, au niveau du champ |
| Raison de dérogation **sans montant** | **Refusée** |
| Remplacer un véhicule par **lui-même** | **Refusé** |
| **Programmer** un remplacement sur une location partie | **Refusé** — on constate, on ne programme pas |
| Bascule **avant le départ réel** | **Refusé** |
| Bascule **hors** de la période ouverte | **Refusé** |
| Véhicule de remplacement **déjà engagé** | **Refusé** par la contrainte d'exclusion |
| Véhicule **retiré** du parc sur un engagement ouvert | **Refusé** |
| Deux périodes qui **se recouvrent** | **Refusé** par la contrainte d'exclusion |
| Un **trou** dans la couverture du contrat | **Refusé** par la contiguïté |
| Un **rang** de période incohérent | **Refusé** |
| Avenant sur un contrat **clos ou annulé** | **Refusé** |
| Avenant de **prolongation** | **Refusé**, et le refus nomme le LOT 23 |
| **Réécrire** le véhicule, le tarif ou le début d'une période | **Refusés**, séparément |
| **Modifier** un avenant | **Refusé** — le droit lui-même est retiré |
| **Modifier** un coût gelé | **Refusé** |
| **Supprimer** une période, un avenant, un coût gelé | **Refusés** |
| Changer `rentals.vehicle_id` par écriture **directe** | **Refusé**, clé de service comprise |
| Forger un avenant ou un coût gelé par appel direct | **Refusés** |
| Télécharger l'avenant sans `rental.rentals.download` | **HTTP 403** |
| Tarif identique présenté comme un changement | **Refusé** |

---

# 15. Corrections rencontrées

Cinq défauts ont été trouvés pendant le lot. Quatre par les recettes, un par le
cycle de démonstration. **Aucun test n'a été désactivé ni assoupli.**

## 15.1 🟥 Une policy réécrite doit se reprendre à sa DERNIÈRE version

**Le défaut le plus grave du lot. Il a été introduit par la migration 087, et
il cassait une fonctionnalité qui n'a rien à voir avec les avenants.**

PostgreSQL n'accepte qu'**une** policy d'`UPDATE` par table : élargir `rentals`
suppose de la **réécrire en entier**. La migration 087 l'a reprise depuis la
migration 031 — et a perdu les deux capacités que la migration **051** y avait
ajoutées :

```
billing.customer_invoices.issue    la facture émise rend la location « Facturée »
billing.customer_invoices.cancel   son annulation la ramène « À facturer »
```

**Conséquence réelle** : émettre une facture client laissait la location « À
facturer ». **Aucune erreur n'était levée** — l'`UPDATE` ne touchait simplement
aucune ligne. La clôture devenait ensuite impossible.

**Pourquoi aucune recette SQL ne l'a vu** : elles s'exécutent avec un rôle qui
**contourne RLS**. `customer_invoices.sql` émet la facture, constate
« Facturée », et a raison de le constater — **pour elle**. C'est
`verify:capabilities`, qui agit avec de **vraies sessions**, qui l'a nommé :
« L'émission a rendu la location « Facturée » — **TO_INVOICE** ».

La migration **093** rétablit les dix capacités, **vérifie que chacune y figure**,
et éprouve **l'effet** — un porteur de la seule capacité d'émission rend bien la
location « Facturée », dans une sous-transaction annulée.

## 15.2 Treize nettoyages de recette ignoraient l'histoire du contrat

Le LOT 22 a donné trois enfants à `rentals`, tous en `on delete restrict`.
Treize recettes supprimaient encore : photos → états des lieux → occupations →
location. Leur `delete` sur `rentals` échouait donc, et — l'erreur `23503` étant
traitée comme « retenu par une donnée réelle » — elles **annonçaient un nettoyage
propre en laissant derrière elles leurs clients, véhicules et contrats**.

23 contrats, 23 véhicules et 9 clients de recette ont ainsi été retrouvés en
base, et retirés.

Le remède n'est pas de corriger treize nettoyages à l'identique :
`scripts/lib/rentals.mjs` écrit **une fois** l'ordre du retrait — coût gelé,
occupations, périodes, avenants — et **quatorze** recettes l'appellent : les treize
réparées, et celle du lot.

## 15.3 Deux recettes couraient devant l'hydratation

`verify-ajustements` échouait **en production seulement**. Un `selectOption` ou
un clic **antérieur à l'hydratation** pose bien la valeur dans le DOM, mais
l'événement n'atteint personne : le premier rendu de React remet ensuite le champ
piloté à son défaut. Le champ paraît rempli, l'écran dit le contraire, et la
recette accuse le SaaS.

Le geste est désormais **rejoué jusqu'à ce que son effet paraisse** — ce qu'un
utilisateur ferait devant une page qui n'a pas fini de charger.

`verify-production` choisissait « le premier encaissement divers » pour éprouver
une phrase qui ne s'écrit que sur un paiement **validé**. L'état est maintenant
exigé, et son absence se **dit** plutôt que de se deviner.

## 15.4 Un exercice jamais ouvert n'est pas l'année zéro

`restore_configuration` écrivait
`current_year = greatest(coalesce(n.current_year, 0), coalesce(r.current_year, 0))`.
Les `coalesce` transformaient un exercice **jamais ouvert** — `NULL` — en l'année
**0**, ce que `fn_numbering_rules_write_guard` refuse à juste titre.

Le défaut ne s'était jamais vu : les quinze règles existantes avaient toutes
produit un numéro. Le LOT 22 ajoute `rental_amendment`, qui n'a encore rien
numéroté — et **toute restauration échouait**.

`greatest` ignore déjà les `NULL` : les `coalesce` ne faisaient que fabriquer un
zéro là où il fallait laisser l'absence. **Trouvé par `verify:backup`**, sur un
cycle réel de réinitialisation et de restauration.

## 15.5 Oublier une règle n'est pas réécrire un engagement

`rental_segments.locked_rule_id` désigne la règle tarifaire d'origine avec
`on delete set null`. La garde refusait **toute** modification de cette colonne :
supprimer une règle tarifaire — opération d'environnement — déclenchait la mise à
`NULL` en cascade, que la garde refusait. Le retrait du jeu de démonstration
s'interrompait sur un message parlant d'avenant, à propos d'un tarif.

La correction (migration **092**) n'autorise qu'une évolution : **non nul → NULL**.
Le montant, lui, reste inatteignable — c'est lui qui porte l'engagement. Même
raisonnement sur `rental_segment_costs.rate_id`.

## 15.6 Défauts d'implémentation corrigés avant livraison

| Défaut | Ce qu'il aurait coûté |
| --- | --- |
| `rental_segment_costs` sans colonne `id` | La fonction d'audit générique désigne la ligne par `id` : la table faisait échouer **sa propre journalisation** |
| PostgREST rend le coût gelé comme un **objet**, non un tableau (`segment_id` est unique) | Le lire comme une collection donnait `undefined` — donc « aucun coût gelé » — **sans erreur**, sur des périodes qui en portaient un |
| `fn_occupation_capability` ignorait `swap` | Il aurait fallu `rental.rentals.create` pour **modifier** un contrat |
| 42 px de débordement horizontal à 360 px | Un libellé de véhicule de 32 caractères dans un en-tête sans retour à la ligne faisait défiler **toute la page** |
| `Select` ignorait un `id` explicite | Deux formulaires portant un champ de même nom produisaient deux contrôles du même identifiant |

---

# 16. Non-régression

| Surface | Résultat |
| --- | --- |
| **25 recettes SQL** | ✅ toutes sans erreur, **`location.sql` sans modification** |
| `verify:capabilities` | ✅ **217 contrôles** — après correction de §15.1 |
| `verify:backup` | ✅ **50 contrôles** — réinitialisation et restauration **réelles** |
| `verify:production` | ✅ **56 contrôles** |
| `verify:responsive` | ✅ **379 contrôles**, 370 boutons — dont **la chronologie** à 360, 768 et 1440 px |
| `verify:ajustements` | ✅ **95 contrôles** |
| `verify:audit` | ✅ **82 contrôles** |
| `verify:groups` | ✅ **73 contrôles** |
| `verify:supplier-rates` | ✅ **61 contrôles** — **LOT 21 intact** |
| `verify:pilotage` | ✅ **60 contrôles** |
| `verify:customer-invoices` | ✅ **52 contrôles** |
| `verify:customer-payments` | ✅ **36 contrôles** |
| `verify:catalog` | ✅ **49 contrôles** — **LOT 20 intact** |
| `verify:password-reset` | ✅ **43 contrôles** — LOT 19 intact |
| `verify:rentals` | ✅ **34 contrôles** |
| `verify:users` | ✅ **14 contrôles** |

**Aucun lot existant ne régresse.** `pricing_rules` est intacte, DEC-002
départage toujours, le catalogue de services du LOT 20 est inchangé, et le coût
d'acquisition du LOT 21 garde sa confidentialité — désormais renforcée par le gel.

---

# 17. Sauvegarde, réinitialisation, restauration

`backup_scope()` passe de **50 à 53 tables**, dans l'ordre :

```
rentals ──▶ rental_amendments ──▶ rental_segments ──▶ rental_segment_costs
vehicles ────────────────────────▶       │
suppliers, supplier_vehicle_rates ───────┴──────────▶ rental_segment_costs
                                         │
                                         └──────────▶ vehicle_occupations
```

⚠ **`vehicle_occupations` change de position** : elle désigne désormais
`rental_segments`, et passe donc **après** elle. La réinitialisation, qui parcourt
la liste à l'envers, la vide **avant** — exactement l'ordre dont elle a besoin.

La migration **vérifie l'ordre paire par paire**, et non par un simple décompte :
une liste fautive peut porter le bon nombre de tables.

## 17.1 Le cycle complet, éprouvé pour de vrai

`verify:backup` a **réinitialisé et restauré la base réelle** : **180 lignes**
sauvegardées, supprimées, puis restaurées **à l'identique, table par table**.
Après restauration, les périodes, l'avenant, les coûts gelés et les
rattachements d'occupation étaient **intacts**, et les policies en place.

Les déclencheurs du lot reconnaissent la restauration : elle **remet** ce qui a
existé, et n'a ni à rejouer une règle de cycle de vie, ni à **regeler** un coût —
le recalculer aujourd'hui produirait une valeur différente de celle qui a été
sauvegardée.

---

# 18. Données de démonstration

`LOC-2026-000368` porte **le cas de la Direction**, et non un montant :

| Période | Véhicule | Tarif client | Coût gelé | Commission |
| :-: | --- | --- | --- | --- |
| 1 | `VEHICULE DEMO 02` — fourni | 40 000 KMF/jour | **30 000** | **10 000 KMF/jour** |
| 2 | `VEHICULE DEMO 07` — **partenariat** | 55 000 KMF/jour | *aucun* | **non calculée** |

Un seul contrat, deux périodes contiguës, **un avenant** — `AVN-2026-000002`,
motif « Panne immobilisante du véhicule initial ».

**Et la seconde période montre l'honnêteté du système** : le véhicule de
remplacement relève d'un **partenariat**, dont les conditions financières ne sont
arrêtées par aucune décision. Son coût est **absent**, sa commission **non
calculée**, et l'écran dit pourquoi. Un jeu de démonstration ne tranche pas ce
que la Direction n'a pas tranché — **il montre la question**.

Le remplacement passe par **la fonction**, jamais par un `insert`. Le script est
**idempotent**, et le cycle `demo:seed` → `demo:clean` → `demo:seed` a été
exécuté **dans les deux sens**, sans résidu.

---

# 19. Responsive et UX

| Format | Résultat |
| --- | --- |
| **360 px** | ✅ aucun débordement, cibles tactiles ≥ 40 px |
| **768 px** | ✅ |
| **1440 px** | ✅ |

La chronologie a été **ajoutée au balayage responsive**, sur un contrat portant
**réellement plusieurs périodes** : mesurer un contrat à période unique ne dirait
rien du tableau ni du formulaire.

**Les champs restent de vrais champs** (consigne §25) : un `select` est un
`select`, une date est une date, un motif est un `textarea`. Aucune case à cocher
ne remplace un champ de formulaire. Le choix entre les deux actes se fait par
**deux boutons**, et le formulaire retenu est **monté seul**.

---

# 20. Documentation

| Fichier | Nature |
| --- | --- |
| `00 Documentation/08_Decisions/01_Journal_des_Decisions.md` | **DEC-045 consignée** (dix sections), réservation levée, index mis à jour |
| `00 Documentation/03_Modules/05_Gestion_de_Location.md` | Addendum daté — l'avenant, la période, la convention temporelle, le gel, ce qui n'est pas tranché |
| `00 Documentation/02_Architecture_Fonctionnelle/02_Navigation.md` | Addendum daté — **aucune entrée de menu** : un onglet, et pourquoi |

**DEC-045 était réservée, pas libre.** Le journal lui avait assigné l'objet
« Avenant de location — LOT 22 » et interdisait de réemployer son numéro. C'est
elle qui est consignée, et non un numéro suivant.

`CLAUDE.md` **n'a pas été modifié** : le lot n'ajoute aucun module, et la
documentation ne se modifie pas pour justifier une implémentation (§52).

---

# 21. Migrations

| # | Fichier | Rôle |
| :-: | --- | --- |
| **087** | `avenants_et_segments_de_location` | Types, trois tables, gardes, gel du coût, deux actes, RLS, capacité, audit |
| **088** | `reprise_des_locations_existantes_en_segments` | **Données** — une période par location, occupations rattachées, recette de comptage |
| **089** | `le_cycle_de_location_suit_ses_segments` | Les **cinq fonctions** du cycle désignent l'occupation par sa période |
| **090** | `perimetre_de_sauvegarde_des_avenants` | 50 → **53** tables, ordre vérifié paire par paire |
| **091** | `un_exercice_jamais_ouvert_n_est_pas_l_annee_zero` | Correction — §15.4 |
| **092** | `oublier_la_regle_n_est_pas_reecrire_l_engagement` | Correction — §15.5 |
| **093** | `une_policy_reecrite_se_reprend_a_sa_derniere_version` | Correction — §15.1 |

Chaque migration porte **ses propres contrôles** et refuse de s'appliquer si le
système est incohérent à l'issue.

---

# 22. Ce qui n'a PAS été développé

**Rien de ce que la consigne interdit n'a été touché** :

❌ facturation périodique · ❌ périodes facturables · ❌ pénalités ·
❌ synthèse de location · ❌ relevé de période · ❌ devis et commandes ·
❌ PDV · ❌ sessions de caisse · ❌ facturation des services ·
❌ `supplier_id` sur les coûts de services · ❌ contrainte d'exclusion sur
`pricing_rules`

Et par ailleurs :

- **aucune permission existante modifiée** — le catalogue s'allonge d'une, il ne
  se réécrit pas ;
- **aucune valeur d'énumération retirée** ;
- **aucune suppression physique** ;
- **aucun système parallèle** de facture, de paiement ou de trésorerie ;
- **`pricing_rules` intacte** — ni colonne, ni contrainte, ni donnée ;
- **`service_variant_costs` intacte** — P-5 reste ouverte ;
- **le Design System inchangé** — les composants existants sont réemployés, et le
  seul modifié — `Select` — l'a été pour honorer un `id` explicite qu'il ignorait.

---

# 23. Limites

| Limite | Portée |
| --- | --- |
| **🟥 P-2 non tranchée** | Aucun coût sur un véhicule ADIKOM ; commission non calculée. Évolution **additive** (§12.1) |
| **🟥 Véhicule de partenariat** | Aucune décision n'existe. Traitement distinct, message distinct |
| **🟥 A-7 non tranchée** | Le modèle est livré, **le barème non**. L'avenant de prolongation est refusé |
| **🟥 Plan 02 §5.7 écarté** | `pricing_rules` intacte ; l'arbitrage suppose de rouvrir DEC-002 |
| **Commission non totalisée** | Additionner des montants journaliers suppose une règle de durée facturable non arrêtée (DEC-008) |
| **Le document de validation n'est plus sur ce poste** | `Validation_Direction_ADIKOM_PILOT_14_decisions.pdf` est absent du dépôt et du poste. Les décisions employées sont celles **transcrites mot pour mot** par le `Plan 02` §2.1 et reprises dans la consigne du lot. Aucune décision n'a été déduite d'une case |
| **Résidus antérieurs retirés** | Deux factures clients, un règlement et une écriture de trésorerie du 17/09, **sur des contrats et un compte de DÉMONSTRATION**, laissés par la recette du LOT 21 sans marqueur : ils retenaient tout le référentiel de démonstration. Retirés après vérification que la chaîne entière ne touchait que des objets de démonstration |
| **🟥 Sauvegarde préalable non prise** | Le Plan 02 §19.2 exigeait une **sauvegarde complète avant** l'application de la migration de données. Elle n'a **pas** été prise : les migrations ont été appliquées, puis le cycle complet de sauvegarde / réinitialisation / restauration a été éprouvé **après**. Ce qui a tenu lieu de filet : les migrations 087 → 091 ont été **entièrement retirées et rejouées deux fois** pendant la mise au point, sans perte, ce qui a éprouvé la réversibilité décrite en 088. La garantie du plan n'en est pas moins **non tenue**, et elle est signalée plutôt que réputée acquise |
| **`verify:permissions`** | Non exécutée : `ADIKOM_ADMIN_USERNAME` n'est pas dans l'environnement de ce poste. Limite d'**environnement**, antérieure au lot |
| **`rentals.locked_amount`** | Conservé tel quel : il est la trace de l'**engagement initial**. Ce sont les périodes qui portent la suite. Aucune fonction de facturation ne le lit autrement qu'avant |

---

# 24. Commits

| SHA | Message |
| --- | --- |
| **`8cea7df`** | `feat: avenants, segments de location et remplacement de vehicule` |
| **`f0d70f2`** | `fix: une policy reecrite se reprend a sa derniere version, et une recette retire l histoire du contrat` |

Aucun secret, aucun artefact de construction, `.env.local` ignoré — vérifié avant
chaque commit.

---

# 25. Déploiement

| | |
| --- | --- |
| SHA **éprouvé** | **`f0d70f2`** — la recette de production a tourné contre lui |
| SHA **déployé** | **`f0d70f2`** |
| État Vercel | **`READY`** |
| URL | https://adikom-pilot.vercel.app |

Le sha déployé a été lu par l'API Vercel et **comparé au commit local** : la
production porte exactement le code éprouvé.

---

# 26. Recette de production

Exécutée contre **https://adikom-pilot.vercel.app**, sur le déploiement portant
`f0d70f2`.

| Recette | Résultat |
| --- | --- |
| `verify-amendments.mjs` | ✅ **74 contrôles, tous réussis** |
| `verify-capabilities.mjs` | ✅ **217 contrôles** — les 196 capacités, code par code |
| `verify-production.mjs` | ✅ **56 contrôles** |
| `verify-responsive.mjs` | ✅ **379 contrôles**, 370 boutons |
| `verify-supplier-rates.mjs` | ✅ **61 contrôles** — LOT 21 intact |
| `verify-catalog.mjs` | ✅ **49 contrôles** — LOT 20 intact |
| `verify-rentals.mjs` | ✅ **34 contrôles** |
| `verify-ajustements.mjs` | ✅ **95 contrôles** |
| `verify-audit.mjs` | ✅ **82 contrôles** |
| `verify-groups.mjs` | ✅ **73 contrôles** |
| `verify-pilotage.mjs` | ✅ **60 contrôles** |
| `verify-customer-invoices.mjs` | ✅ **52 contrôles** |
| `verify-customer-payments.mjs` | ✅ **36 contrôles** |
| `verify-password-reset.mjs` | ✅ **43 contrôles** |
| `verify-users.mjs` | ✅ **14 contrôles** |

## 26.1 Les seize points exigés, un par un

| # | Point | Vérifié en production |
| :-: | --- | --- |
| 1 | **Création d'une location** | Réservation → confirmation → conversion → départ, par les fonctions atomiques |
| 2 | **Création d'un avenant** | Par l'écran, numéroté `AVN-…`, motivé, daté |
| 3 | **Remplacement de véhicule** | Deux périodes contiguës, calendrier déplacé, statuts des deux véhicules |
| 4 | **Conservation du contrat** | Identifiant et numéro **inchangés**, aucun contrat nouveau |
| 5 | **Chronologie** | Deux périodes, deux véhicules, l'avenant qui les sépare |
| 6 | **Changement de tarif** | 50 000 conservé sur sa période, 60 000 appliqué à la suivante |
| 7 | **Cas exceptionnel** | `swap` seul refusé · sans raison refusé · accordé, tracé, journalisé `PRICE_CHANGE` |
| 8 | **Coût fournisseur** | Gelé dès l'engagement, 40 000 puis 45 000 |
| 9 | **Commission** | 10 000 puis 15 000, par période, jamais totalisée |
| 10 | **Confidentialité** | L'exploitant n'obtient le coût par **aucune** voie |
| 11 | **API directe** | PostgREST sur les coûts gelés : **aucune ligne** ; avenant et coût forgés : **refusés** |
| 12 | **RLS** | Trois tables, refus par défaut, lecture séparée de l'écriture |
| 13 | **Audit** | `CREATE` pour l'avenant, `PRICE_CHANGE` pour la dérogation, détail gardé |
| 14 | **PDF** | Contrat et **avenant** produits, `%PDF`, 403 sans la capacité |
| 15 | **Non-régression** | 25 recettes SQL + 15 recettes applicatives |
| 16 | **Responsive** | La chronologie mesurée à **360, 768 et 1440 px** |

## 26.2 Aucun résidu

Comptes, clients, véhicules, fournisseur, catégories, tarifs, contrats et
avenants de recette **supprimés**. Vérifié en base après le passage.

Le jeu de démonstration est **intact** — `{clients: 6, vehicles: 8, suppliers: 4,
supplierInvoices: 3, imputations: 1}` avant comme après — et la chronologie de
`LOC-2026-000368` est **contiguë**.

La page publique annonce **196 capacités attribuables**, lues en base et non
recopiées.

---

# 27. Conclusion

Le LOT 22 répond à une question que le SaaS ne savait pas poser : **que se
passe-t-il quand le véhicule change en cours de route ?**

**Le contrat ne change pas.** C'est la décision de la Direction, et c'est
désormais ce que la base garantit : l'identifiant tient, le client tient, la
réservation d'origine tient. Ce qui change est un **acte**, écrit, motivé,
attribué ; ce qui en résulte est une **période**, avec son véhicule, ses dates et
son tarif. Aucune journée n'est comptée deux fois, aucune ne manque, et le
contrat n'est jamais sans véhicule affecté — la base refuse les trois.

**Le client paie généralement le nouveau tarif, et l'exception existe.** Elle
exige sa capacité, sa raison écrite, et elle laisse une trace dans le journal.
« Généralement » n'est pas devenu une règle, et une dérogation ne peut pas se
glisser sans que quelqu'un l'ait décidée et dite.

**Le coût est gelé à l'engagement.** L'écart que le LOT 21 avait nommé est fermé :
une saisie rétroactive de tarif fournisseur ne déplace plus l'historique
financier d'une location engagée. Et le gel n'est pas un acte — c'est une
conséquence, écrite par la base, que l'exploitant provoque sans jamais la lire.

**Et cinq défauts ont été trouvés, dont un qui ne venait pas de ce lot.** Émettre
une facture client laissait la location « À facturer », en silence, parce qu'une
policy réécrite avait perdu deux capacités. Aucune recette SQL ne pouvait le
voir : elles contournent RLS. C'est une recette agissant avec de **vraies
sessions** qui l'a nommé — et c'est la leçon que la migration 093 inscrit pour les
lots suivants.

**Trois questions restent ouvertes, nommées, non comblées** : le coût interne
d'un véhicule ADIKOM, celui d'un véhicule de partenariat, et le barème des
pénalités. Aucune règle n'a été inventée pour les remplacer — le refus lui-même
porte la question.

---

## LOT 22 — TERMINÉ

**CODE TESTÉ** — 25 contrôles de base · 74 contrôles applicatifs ·
29 tests unitaires nouveaux · 25 recettes SQL · 15 recettes applicatives ·
aucune régression

**GITHUB À JOUR** — `f0d70f2` sur `main`

**VERCEL À JOUR** — `f0d70f2`, état `READY`

**PRODUCTION VALIDÉE** — 15 recettes, **1 325 contrôles** (74 + 217 + 56 + 379 +
61 + 49 + 34 + 95 + 82 + 73 + 60 + 52 + 36 + 43 + 14) contre
https://adikom-pilot.vercel.app, aucun résidu

**SAUVEGARDE ÉPROUVÉE** — réinitialisation et restauration réelles, 180 lignes,
périodes, avenants et coûts gelés intacts

**RAPPORT CRÉÉ** — le présent document

---

*ADIKOM PILOT — SaaS interne de gestion et de pilotage — ADIKOM Technology & Travel*
