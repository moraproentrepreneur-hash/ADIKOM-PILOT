# Rapport 05 — Groupes & Vue hiérarchique

**LOT 14** · Phase 4 — Organisation
**Module 08 — Utilisateurs & Groupes** (§27 à §37, §52)
**Date :** 5 septembre 2026
**Décision associée :** DEC-037
**Commit :** `23cfd27` — *qui appartient à quoi, qui en répond, et qui a le droit d'en décider*
**Production :** https://adikom-pilot.vercel.app — `READY` sur `23cfd27`

---

## 1. Objectif du lot

Livrer les deux menus du `Module 08` §3 que la barre latérale annonçait encore
comme *à venir* :

```
Utilisateurs & Groupes
│
├── Utilisateurs
│   ├── Nouvel utilisateur     ✔ Phase 1
│   ├── Liste des utilisateurs ✔ Phase 1
│   └── Vue hiérarchique       ← LOT 14
│
└── Groupes
    ├── Nouveau groupe         ← LOT 14
    └── Liste des groupes      ← LOT 14
```

Critères d'acceptation du §61 couverts : **9, 10, 11, 25, 26**.
Les critères 1 à 8, 12 à 24, 27 et 28 étaient déjà tenus par la Phase 1.

---

## 2. Analyse préalable

### 2.1 Ce qui existait déjà

Le `Module 08` avait été **ouvert dès la Phase 1**, mais seulement pour moitié :

| Élément | Origine | État avant le lot |
| --- | --- | --- |
| `groups`, `user_groups` | migration 002 | Tables créées, protections de suppression posées |
| `group_permissions` | migration 003 | Table créée, moteur d'autorisation complet |
| `departments`, `user_departments` (dont `is_manager`) | migration 002 | Tables créées — `is_manager` **jamais renseignée** |
| `app_users.manager_id` | migration 002 | Colonne créée, saisie dans la fiche |
| Six capacités du lot | migration 007 | Au catalogue, **inutilisables faute d'écran** |
| Policies RLS des groupes | migration 006 | Posées — avec un défaut, voir §7.1 |
| Déclencheurs d'audit | migration 004 | `groups`, `user_groups`, `group_permissions` |
| Cinq départements, six groupes de départ | migration 008 | Peuplés |

Le lot n'avait donc **aucune table à créer**. Ce qu'il devait livrer, ce sont
les écrans, et les gardes que ces écrans supposent.

### 2.2 Documents consultés

`README.md` · `CLAUDE.md` (§17 à §22, §19 bis, §37, §43, §54, §61)
`00 Documentation/03_Modules/08_Utilisateurs_et_Groupes.md` (intégral)
`00 Documentation/05_Regles_Metier/05_Permissions.md` (§24, §42, §50, §62, §85, §90)
`00 Documentation/08_Decisions/01_Journal_des_Decisions.md` — DEC-009, DEC-017,
DEC-022, DEC-024, DEC-033 §h, DEC-034 §a et §c, DEC-035 §b et §f, DEC-036 §c et §d
`RAPPORTS/Rapport 04_...md`
Migrations 002, 003, 004, 006, 007, 008, 011, 058, 059.

---

## 3. Arbitrages — aucun n'était bloquant

Quatre questions se posaient avant de coder. Les quatre se tranchaient **par
les documents existants**, sans arbitrage d'ADIKOM.

### 3.1 Faut-il créer des permissions ?

**Non.** `CLAUDE.md` §19 bis impose d'identifier d'abord la permission existante.
Les six existent mot pour mot depuis la migration 007 :

| Acte livré | Capacité |
| --- | --- |
| Consulter les groupes et leur décompte de membres | `users.groups.view` |
| Créer un groupe | `users.groups.create` |
| Renommer, décrire, ordonner | `users.groups.update` |
| Activer, désactiver, supprimer | `users.groups.archive` |
| Changer ce qu'un groupe accorde ou refuse | `users.groups.permissions.update` |
| Consulter l'organigramme | `users.hierarchy.view` |

L'**affectation des membres** n'en reçoit pas une septième : cocher quelqu'un
dans un groupe change **ses** droits, et c'est `users.users.permissions.update`
— la capacité que la policy `user_groups_write` réclame depuis la migration 006.
En créer une de plus serait la créer d'office (DEC-024).

**Catalogue : 170 → 170.**

### 3.2 La vue hiérarchique exige-t-elle aussi `users.users.view` ?

**Non, et la réponse était écrite dans le seed.** La migration 008 accorde
`users.hierarchy.view` aux groupes « Direction » et « Assistant(e) de
direction » **sans** leur donner la lecture des utilisateurs. Si le dessin
dépendait de la liste, ces deux groupes verraient un organigramme vide : le seed
serait faux depuis l'origine.

### 3.3 Qui figure à l'organigramme ?

Les comptes **actifs**. §35 demande de représenter « la structure interne
d'ADIKOM » ; §13 conserve l'historique dans la fiche. Les comptes écartés sont
**comptés et annoncés** (DEC-017). *Le point est signalé aux arbitrages ouverts
si ADIKOM souhaite un autre périmètre.*

### 3.4 D'où vient la hiérarchie ?

De `app_users.manager_id`, déjà saisi dans la fiche, complété par les
départements dont la personne **répond** (`user_departments.is_manager`, §36).
Rien de nouveau n'est modélisé.

---

## 4. Architecture et modèle de données

**Aucune table n'est créée.** Le lot ajoute des gardes et deux lectures.

### 4.1 Ce que la base gagne

```
groups ──────────────┐
  │ groups_write_guard      · désactiver n'est pas modifier
  │ groups_protect_deletion · un groupe utilisé ne se supprime pas
  ▼
group_permissions ───┐
  │ group_permissions_no_self_change · nul ne s'accorde un droit par son groupe
  ▼
app_users ───────────┐
  │ app_users_no_manager_cycle · un organigramme a une racine
  ▼
organisation_chart()      → structure, comptes actifs · users.hierarchy.view
groups_member_counts()    → décomptes, jamais de noms · users.groups.view
```

### 4.2 Ce qui est dérivé, jamais stocké

| Valeur | Recalculée par |
| --- | --- |
| Effectif d'un groupe | `groups_member_counts()` |
| Nombre de permissions accordées / refusées | l'écran, à chaque lecture |
| Profondeur, chemin, rattachement d'un nœud | `organisation_chart()` |
| Comptes écartés du dessin | `organisation_chart_excluded()` |
| Verdict effectif d'une permission | `effective_permissions()` |

Un compteur tenu par déclencheur serait faux au premier oubli, et **un total
faux fait autorité plus longtemps qu'un total absent** (DEC-034 §a). La recette
SQL vérifie qu'aucune colonne d'effectif n'a été ajoutée à `groups`.

### 4.3 `organisation_chart()` — ce qu'elle rend

`id · full_name · job_title · manager_id · declared_manager_id · depth ·
sort_path · is_super_admin · is_detached · departments[] · managed[]`

Elle ne rend **ni email, ni téléphone, ni dernière connexion, ni notes, ni
identifiant** : une capacité ouvre exactement ce qu'elle nomme (DEC-024). La
recette contrôle la **signature** de la fonction, et pas seulement son
comportement.

---

## 5. Permissions

### 5.1 Aucune permission ajoutée

**Le catalogue reste à 170.** Vérifié par `db:verify:groups` (contrôle 1) et par
`verify:groups` (section 9).

### 5.2 Ce qui n'est délibérément pas créé

| Non créée | Pourquoi |
| --- | --- |
| `users.groups.members.update` | Affecter quelqu'un change **ses** droits : `users.users.permissions.update` le couvre déjà |
| `users.groups.export` · `.download` · `.print` | Le lot ne produit **aucun document ni aucun état** |
| `users.hierarchy.export` · `.download` · `.print` | Idem |
| `users.groups.duplicate` | Aucun écran ne duplique un groupe |

La recette SQL vérifie explicitement que **aucune** de ces capacités n'a été
créée.

### 5.3 Répartition par acte

| Acte | Capacité | Contrôlée où |
| --- | --- | --- |
| Ouvrir la liste et la fiche | `users.groups.view` | Page + RLS |
| Créer | `users.groups.create` | Action + RLS |
| Renommer, décrire, ordonner | `users.groups.update` | Action + RLS + **déclencheur** |
| Activer / désactiver / supprimer | `users.groups.archive` | Action + RLS + **déclencheur** |
| Changer les permissions du groupe | `users.groups.permissions.update` | Action + RLS + **déclencheur** |
| Changer les membres | `users.users.permissions.update` | Action + RLS + **déclencheur** |
| Ouvrir l'organigramme | `users.hierarchy.view` | Page + **fonction** |
| Marquer un responsable de département | `users.users.update` | Action + RLS |

---

## 6. Règles métier

### 6.1 Désactiver n'est pas modifier (§52, DEC-024)

`groups.is_active` vit sur la table que la policy d'`UPDATE` gouverne. Une
policy dit **qui peut écrire** ; elle ne distingue pas deux actes portés par des
colonnes voisines. Sans garde, un compte de `users.groups.update` désactivait un
groupe — donc retirait d'un coup leurs droits hérités à tous ses membres — sans
jamais détenir `users.groups.archive`.

`fn_group_write_guard` tranche, **dans les deux sens** : activer relève de
`.archive` autant que désactiver.

Deux colonnes sont **gelées** pour un acteur applicatif :
- `code` — il identifie le groupe dans les exports et le journal d'audit ;
- `is_system` — s'en octroyer un créerait un groupe indestructible.

Ce gel est une règle d'**application**, non une invariance absolue : une
migration future peut légitimement corriger un code, et elle n'a pas d'acteur.

### 6.2 Nul ne s'accorde un droit par son propre groupe

Un membre détenteur de `users.groups.permissions.update` ne peut pas toucher aux
permissions de **son** groupe. Aucune exception pour le Super Admin : il ne tient
pas ses droits d'un groupe, la règle ne lui retire rien.

Ce qui reste possible — et c'est le fonctionnement documenté — est de configurer
un groupe **auquel on n'appartient pas**. La recette l'éprouve dans les deux
sens : la règle ferme l'escalade, elle ne ferme pas le métier.

### 6.3 La hiérarchie ne boucle pas (§35)

La migration 002 interdisait le cycle de longueur 1 ; rien n'interdisait celui
de longueur 2. Un organigramme sans racine ne se dessine pas : c'est une
**impossibilité**, pas une question de droit. La règle vaut donc aussi pour une
migration et pour la clé de service (DEC-036 §c).

### 6.4 Ranger n'est pas effacer (§52, CLAUDE.md §22)

Un groupe **désactivé** cesse de transmettre ses permissions ; ses règles
restent en base et reprennent effet à la réactivation. Un groupe **supprimé**
perd tout : la base ne l'accepte que s'il ne compte aucun membre et n'est pas un
groupe système. L'écran propose la désactivation en premier.

### 6.5 Appartenir n'est pas diriger (§36)

Une personne peut être **rattachée** à plusieurs départements et en **diriger**
plusieurs — sur un seul compte. La colonne `is_manager` existait depuis la
migration 002 ; aucun écran ne la renseignait, et le critère §61.26 n'était donc
pas réellement tenu. Le formulaire porte désormais deux cases par département,
la seconde ne s'activant qu'avec la première.

### 6.6 Un décompte, jamais un nom (§29, DEC-017)

`groups_member_counts()` exige `users.groups.view` et rend un **nombre**.
L'identité des membres reste derrière `users.users.view`, et la fiche **nomme**
cette absence — « Membres non consultables », avec l'effectif réel — au lieu
d'afficher un groupe vide.

### 6.7 Résolution des permissions (DEC-009, §32)

Le lot rend cette règle **visible**, il ne la change pas :

```
Refus explicite (individuel ou de groupe)  → refusé
Autorisation individuelle                  → autorisé
Autorisation héritée d'un groupe ACTIF     → autorisé
Aucune règle                               → refusé
```

L'écran l'énonce, et la recette l'éprouve de bout en bout — y compris le cas de
deux groupes qui se contredisent.

---

## 7. Défauts découverts et corrigés

Les trois premiers ont été **découverts par la recette**, chacun sur un contrôle
rouge.

### 7.1 Personne ne pouvait plus désactiver un groupe — migration **061**

La garde du §6.1 posée, la recette a montré que `users.groups.archive` se voyait
refuser l'écriture par la **policy** `groups_update` — qui n'admettait que
`.update` — avant même d'atteindre le déclencheur. Résultat net : plus personne
ne pouvait désactiver un groupe.

La policy datait de la migration 006, d'un temps où aucun écran n'écrivait dans
cette table : la contradiction dormait sans effet.

**Correction** — la répartition de DEC-035 §b, déjà appliquée aux projets :

> La **policy** dit qui peut écrire dans la table.
> Le **déclencheur** dit qui peut accomplir cet acte-là.

### 7.2 Une garde comptait ce qu'elle voyait — migration **062**

Un compte de `users.groups.archive` sans `users.users.view` a supprimé un groupe
**peuplé** : `fn_protect_group_deletion` comptait les membres **à travers RLS**,
lisait zéro, et laissait passer. La **clé étrangère** a refusé à sa place — avec
un message de base de données, là où `CLAUDE.md` §43 exige un message métier.

La même cécité dormait dans `fn_protect_last_super_admin`, qui compte les
**autres** Super Admins actifs : invisibles, ils auraient été comptés pour zéro,
et la garde aurait **refusé une opération légitime**. Un faux refus n'est pas
moins un défaut qu'une fausse autorisation.

**Règle qui en découle :** *une garde qui compte doit compter la vérité, pas ce
que l'appelant a le droit de voir.* Ces fonctions ne renvoient aucune ligne :
les passer en `SECURITY DEFINER` n'élargit rien.

### 7.3 L'héritage se lisait par une porte fermée — migration **063**

L'onglet « Permissions » de la fiche utilisateur lisait l'héritage par une
requête **directe** sur `group_permissions`, dont la policy exige
`users.groups.view`. RLS ne lève pas, elle masque : un administrateur des
permissions dépourvu de cette capacité lisait **« non défini »** sur un droit
qu'un groupe **refusait** — et aurait lu la même chose sur un droit qu'un groupe
**accorde**, c'est-à-dire l'inverse de la vérité.

Le `Module 08` §48 exige quatre états distinguables : accordé, refusé,
**hérité**, non défini.

**Correction** — `effective_permissions()` rend désormais une colonne
`inherited_effect` : le verdict des groupes seuls, y compris lorsqu'une règle
individuelle le masque. Elle est en `SECURITY DEFINER` et vérifie déjà sa propre
autorisation depuis la migration 011 : **qui a le droit de voir les droits d'une
personne a le droit d'en connaître l'origine.** Aucune capacité n'est élargie.

*Défaut antérieur au lot, exposé par la recette de non-régression de l'onglet
réécrit.*

### 7.4 Une mise en place qui échouait en silence — recette

Le premier passage de `verify:groups` a montré deux départements dirigés
absents de l'organigramme. La cause n'était pas le code : PostgREST refuse un
lot d'insertion dont les objets n'ont pas **le même jeu de clés** (PGRST102), et
l'erreur n'était pas lue. La recette lève désormais sur chaque insertion de mise
en place.

### 7.5 Un message de refus trompeur — recette

Un contrôle vert affichait « *** AUTORISÉ À TORT *** » en détail, parce que
l'expression ne distinguait pas « la policy a masqué » (aucune ligne modifiée)
de « le déclencheur a levé ». Corrigé : le détail dit désormais **comment** le
refus s'est produit.

---

## 8. Sécurité et RLS

### 8.1 Trois barrières, aucune ne remplace l'autre

| Barrière | Où |
| --- | --- |
| Garde applicative | `requirePermissionOrRedirect` sur chaque page, `requirePermission` sur chaque action |
| RLS | Policies de `groups`, `user_groups`, `group_permissions`, `app_users` |
| Déclencheurs | `groups_write_guard`, `group_permissions_no_self_change`, `user_groups_no_self_change`, `app_users_no_manager_cycle`, `groups_protect_deletion`, `app_users_protect_last_super_admin` |

Le masquage d'interface n'en est pas une : la recette éprouve chaque frontière
par **appel direct** à l'API, sans passer par aucun écran.

### 8.2 Ce que la recette a prouvé par appel direct

- `users.groups.update` ne désactive pas, ne renomme pas le code, ne s'octroie
  pas `is_system` ;
- `users.groups.archive` ne renomme pas ;
- un membre ne modifie pas les permissions de son groupe, et **n'obtient pas**
  la capacité convoitée ;
- `users.groups.permissions.update` n'ouvre pas l'affectation des membres ;
- nul ne s'affecte lui-même à un groupe ;
- `organisation_chart()` refuse sans `users.hierarchy.view`, et ne rend jamais
  d'email, de téléphone ni de dernière connexion ;
- `groups_member_counts()` refuse sans `users.groups.view` ;
- la vue hiérarchique **n'ouvre pas** la liste des utilisateurs.

### 8.3 Audit (§54)

Aucun déclencheur d'audit n'est ajouté : ceux de la migration 004 couvrent déjà
`groups`, `user_groups` et `group_permissions`. La recette vérifie qu'un groupe
créé, modifié, configuré et peuplé laisse bien sa trace — 6 lignes observées.

---

## 9. Migrations

| Fichier | Contenu |
| --- | --- |
| `20260905000100_groupes_et_vue_hierarchique.sql` | **060** — `fn_group_write_guard`, `fn_prevent_self_group_privilege`, `fn_prevent_manager_cycle`, `organisation_chart()`, `organisation_chart_excluded()`, `groups_member_counts()`. Aucune table, aucune capacité. |
| `20260905000200_droit_de_desactiver_un_groupe.sql` | **061** — la policy `groups_update` admet `.update` **ou** `.archive` ; le déclencheur tranche. |
| `20260905000300_une_protection_compte_la_verite.sql` | **062** — `fn_protect_group_deletion` et `fn_protect_last_super_admin` passent en `SECURITY DEFINER`. |
| `20260905000400_l_heritage_se_lit_sans_ouvrir_les_groupes.sql` | **063** — `effective_permissions()` rend `inherited_effect`. |

Toutes appliquées sur Supabase Cloud (`npm run db:push`).

---

## 10. Fichiers créés et modifiés

### Créés

```
supabase/migrations/20260905000100_groupes_et_vue_hierarchique.sql
supabase/migrations/20260905000200_droit_de_desactiver_un_groupe.sql
supabase/migrations/20260905000300_une_protection_compte_la_verite.sql
supabase/migrations/20260905000400_l_heritage_se_lit_sans_ouvrir_les_groupes.sql
supabase/tests/groups.sql
scripts/verify-groups.mjs

src/features/groups/constants.ts
src/features/groups/data.ts
src/features/groups/actions.ts
src/features/groups/group-form.tsx
src/features/groups/group-permissions-panel.tsx
src/features/groups/group-lifecycle-form.tsx
src/features/groups/members-form.tsx

src/features/users/hierarchy.ts
src/features/users/permission-tree.tsx      ← arborescence partagée

src/app/(app)/utilisateurs/groupes/page.tsx
src/app/(app)/utilisateurs/groupes/nouveau/page.tsx
src/app/(app)/utilisateurs/groupes/[id]/page.tsx
src/app/(app)/utilisateurs/hierarchie/page.tsx
```

### Modifiés

```
src/features/users/permissions-panel.tsx    ← réécrit sur l'arborescence partagée
src/features/users/data.ts                  ← héritage via effective_permissions ;
                                              managedDepartmentIds / managedDepartments
src/features/users/actions.ts               ← is_manager dans syncAssignments
src/features/users/user-form.tsx            ← case « Responsable » par département
src/app/(app)/utilisateurs/[id]/page.tsx    ← départements dirigés distingués
src/lib/navigation.ts                       ← Groupes et Vue hiérarchique : ready
package.json                                ← db:verify:groups, verify:groups
00 Documentation/08_Decisions/01_Journal_des_Decisions.md  ← DEC-037
```

### Composant partagé (CLAUDE.md §37)

L'onglet « Permissions » de la fiche **utilisateur** et celui de la fiche
**groupe** présentent la même arborescence, le même sélecteur à trois positions,
le même décompte. Seule leur sémantique diffère — héritage d'un côté, décision
de l'autre — et cette différence vit dans une fonction passée au composant,
jamais dans deux composants presque identiques.

---

## 11. Tests

### 11.1 Tests SQL — `npm run db:verify:groups`

**19 contrôles, tous verts.**

| # | Contrôle |
| --- | --- |
| 1 | Catalogue à 170 ; les six capacités du lot existent ; aucune capacité d'export inventée |
| 2 | Les cinq gardes de gouvernance sont en place |
| 3a | Nul n'est son propre responsable |
| 3b | Une hiérarchie circulaire est refusée, **même pour la clé de service** |
| 4 | Tout compte actif figure à l'organigramme, une seule fois, à sa profondeur réelle |
| 5 | L'organigramme ne rend ni email, ni téléphone, ni connexion *(signature de la fonction)* |
| 6 | Responsable désactivé : le subordonné remonte à la racine, signalé et compté |
| 7 | Un compte, deux départements dirigés (§36) |
| 8 | Un rattachement sans responsabilité reste un rattachement |
| 9 | Le décompte des membres suit la réalité ; aucun effectif stocké |
| 10 | Un groupe peuplé ne se supprime pas, **et le refus le dit** |
| 11 | Un groupe système ne se supprime pas |
| 12 | Un groupe vide et ordinaire se supprime |
| 13 | Désactiver suspend les droits sans perdre les règles ; réactiver les rétablit |
| 14 | Un refus de groupe prime sur une autorisation individuelle (DEC-009) |
| 14b | Entre deux groupes contradictoires, le refus l'emporte |
| 15 | La veille ignore la gouvernance : aucun événement de création inventé |
| 16 | Les mouvements du groupe sont journalisés |
| 17 | Location, facturation, trésorerie et tiers : intacts |

Transaction annulée en fin de script : aucun résidu.

### 11.2 Recette de production — `npm run verify:groups`

**73 contrôles, tous verts**, exécutés contre `https://adikom-pilot.vercel.app`
avec **sept profils réels**, aucun ne cumulant deux capacités du lot — c'est
précisément le cumul qui masquerait un défaut.

| Section | Contrôles | Ce qu'elle éprouve |
| --- | --- | --- |
| 1 | 5 | Chaque écran exige sa capacité ; la barre latérale n'annonce rien qu'elle ne puisse ouvrir |
| 2 | 7 | Les groupes se listent et s'ouvrent ; colonnes du §29 ; lecture seule sans droit |
| 3 | 8 | **Désactiver n'est pas modifier**, dans les deux sens, par `PATCH` direct |
| 4 | 8 | **Nul ne s'accorde un droit par son propre groupe** ; l'écran le dit |
| 5 | 3 | Un groupe transmet, se tait une fois désactivé ; le refus prime (DEC-009) |
| 6 | 10 | La vue hiérarchique est **autonome** et ne rend que la structure |
| 7 | 4 | Le décompte est honnête, l'identité reste fermée |
| 8 | 4 | La suppression reste sous contrôle, et le refus est métier |
| 9 | 10 | Non-régression, dont l'onglet Permissions réécrit |
| 10 | 14 | **Responsive** — mobile 390 px, tablette 820 px, desktop 1440 px |

### 11.2.1 Responsive (§55, `CLAUDE.md` §35)

Les quatre écrans du lot sont chargés à trois formats, et le contrôle porte sur
le **débordement horizontal du corps de page** : un écran qu'il faut faire
glisser latéralement pour lire n'est pas responsive, il est réduit. Les
débordements *internes* — un tableau dans son propre conteneur
`overflow-x-auto` — sont légitimes et ne sont pas comptés.

Débordement mesuré : **0 px sur les douze combinaisons**.

Deux contrôles supplémentaires vérifient que l'interface est bien **réorganisée**
et non rétrécie (Design System §53) : sur mobile, le tableau des groupes cède la
place à des cartes, et le groupe y reste lisible.

### 11.3 Tests unitaires et build

```
npm run lint       ✔
npm run typecheck  ✔
npm test           ✔  10 fichiers, 179 tests
npm run build      ✔
```

---

## 12. Non-régressions vérifiées

Toutes exécutées **contre la production**, après déploiement.

| Recette | Résultat |
| --- | --- |
| `db:verify` (socle) | ✔ tous contrôles |
| `db:verify:location` · `:cycle` · `:incidents` · `:maintenance` · `:maintenance-costs` | ✔ |
| `db:verify:imputations` · `:supplier-invoices` · `:treasury` | ✔ |
| `db:verify:customer-invoices` · `:customer-payments` · `:dashboard` | ✔ |
| `db:verify:notifications` · `:analytics` · `:projects` · `:planning` | ✔ |
| `verify:capabilities` | ✔ **206** contrôles |
| `verify:projects` | ✔ 76 contrôles |
| `verify:planning` | ✔ 100 contrôles |
| `verify:notifications` | ✔ 85 contrôles |
| `verify:analytics` | ✔ 82 contrôles |
| `verify:pilotage` | ✔ 55 contrôles |
| `verify:customer-invoices` | ✔ 52 contrôles |
| `verify:imputations` | ✔ 47 contrôles |
| `verify:reservations` | ✔ 35 contrôles |
| `verify:rentals` | ✔ 34 contrôles |
| `verify:treasury` | ✔ 34 contrôles |
| `verify:users` | ✔ 14 contrôles |
| `verify:users:ui` · `verify:permissions` | **non exécutées** — voir ci-dessous |

**820 contrôles de non-régression**, tous verts.

L'engagement le plus lourd portait sur `effective_permissions()`, dont dépend
`my_permissions()` — donc **toute la navigation du SaaS**. `verify:capabilities`
l'éprouve à elle seule sur 206 contrôles, et les autres recettes sur des dizaines
de profils et d'écrans distincts.

> **Deux recettes n'ont pas pu être exécutées** — `verify:users:ui` et
> `verify:permissions` exigent les variables `ADIKOM_ADMIN_USERNAME` et
> `ADIKOM_ADMIN_PASSWORD`, absentes de `.env.local`. Elles couvrent l'écran des
> utilisateurs et l'onglet « Permissions » **avec le compte Super Admin réel**.
>
> Le périmètre qu'elles auraient couvert est éprouvé autrement : la section 9 de
> `verify:groups` ouvre l'onglet réécrit avec un profil créé pour la recette,
> vérifie les quatre états du §48 — dont le **refus hérité**, celui qui a révélé
> le défaut §7.3 — et **enregistre réellement** une règle individuelle par
> l'écran. Ces deux recettes restent à relancer par ADIKOM, qui détient les
> identifiants.

### 12.1 Un faux positif, tracé

Le premier passage de `verify:analytics` a signalé des **résidus** —
`supplier_invoices : 1`, `suppliers : 2`, `vehicle_categories : 1`. Vérification
faite, il ne s'agissait **pas d'une régression** : le nettoyage de cette recette
ignore le résultat de ses suppressions, et une interruption réseau en cours de
`finally` avait rompu la chaîne au niveau de l'imputation qui retient la facture.

Les résidus ont été **supprimés à la main, dans l'ordre des dépendances**, un
balayage global a confirmé qu'il n'en restait aucun, et la recette a été
**relancée : 82 contrôles, tous réussis, aucun résidu**.

> **Fragilité signalée, non corrigée** — `scripts/verify-analytics.mjs` ignore
> l'erreur de chacune de ses suppressions, et son balayage final **compte** les
> résidus sans les **reprendre**. Il échoue donc bruyamment, ce qui est le bon
> comportement, mais laisse à la main un nettoyage qu'il pourrait terminer seul.
> La correction appartient au LOT 11 ; la modifier ici, sans nécessité, aurait
> déstabilisé une recette verte.

---

## 13. GitHub et Vercel

| | |
| --- | --- |
| Dépôt | `moraproentrepreneur-hash/ADIKOM-PILOT`, branche `main` |
| Commit | `23cfd27` |
| Fichiers | 26 (dont 20 créés) |
| Secrets | Diff vérifié — **aucune valeur secrète**, seulement des noms de variables |
| Vercel | Déploiement `READY` sur `23cfd27`, production `https://adikom-pilot.vercel.app` |

---

## 14. État final de la base

| | |
| --- | --- |
| Migrations appliquées | jusqu'à **063** |
| Catalogue de permissions | **170** — inchangé |
| Tables | inchangées (aucune créée, aucune supprimée) |
| Départements | 5 |
| Groupes de départ | 6, tous actifs, aucun système |
| Attributions de permission aux groupes | 164 |
| Appartenances utilisateur ↔ groupe | **0** — les groupes de départ ne sont encore attribués à personne (voir §16) |
| Données DEMO | **3 clients · 3 véhicules · 3 fournisseurs** — intactes |
| Résidus de recette | **aucun** (balayage global sur 14 tables + comptes) |

---

## 15. Ce qui n'a volontairement pas été implémenté

| Non livré | Pourquoi |
| --- | --- |
| **Journal d'activité** (`users.audit.view`) | Menu distinct du §3 ; il a sa capacité et son écran propres, et relève d'un lot dédié |
| **Export / impression** des groupes et de l'organigramme | Le lot ne produit aucun document ; les capacités correspondantes n'existent pas et **ne se déduisent pas** de `.view` (DEC-024) — arbitrage ouvert n° 24 |
| **Duplication d'un groupe** | Aucun document ne l'énonce — arbitrage ouvert n° 26 |
| **Notifications de gouvernance** (§53) | « Utilisateur créé », « permission modifiée » sont des **événements de création** : arbitrage ouvert de DEC-033 §h. `notifications_watch()` reste à 15 familles |
| **Organigramme des comptes non actifs** | Le dessin porte l'organisation actuelle — arbitrage ouvert n° 23 |
| **Modification de son propre profil** | Aucune auto-édition n'est prévue par la documentation (policy de la migration 006) |
| **Permissions conditionnelles, accès temporaire, 2FA** | §57 les range explicitement hors MVP |

---

## 16. Arbitrages restant ouverts

Le lot en ajoute **trois** (n° 23, 24, 25 du journal) et n'en ferme aucun.

| N° | Question |
| --- | --- |
| **23** — DEC-037 §e | L'organigramme doit-il pouvoir montrer les **comptes non actifs** ? Décider quels statuts y figurent, et comment ils se distinguent d'un collaborateur en poste. |
| **24** — DEC-037 §a | L'organigramme et la liste des groupes doivent-ils pouvoir être **exportés, téléchargés ou imprimés** ? Suppose de créer les capacités correspondantes. |
| **25** — DEC-037 §h | Un groupe doit-il pouvoir être **dupliqué** ? Suppose de décider si les membres suivent, et sous quelle capacité. |

**DEC-009 reste ouverte pour confirmation.** La règle de résolution
multi-groupes — *refus explicite > autorisation > absence* — est implémentée
depuis la Phase 1 et le LOT 14 la rend enfin **visible à l'écran**. Elle
fonctionne et la recette l'éprouve ; il reste à ADIKOM à la confirmer
formellement, maintenant qu'elle peut la voir à l'œuvre.

Les 22 autres arbitrages du journal restent inchangés — dont le **n° 22**, les
dix recettes SQL qui bornent encore leurs périodes sur `current_date` (UTC) au
lieu du jour civil des Comores. Aucune ne concerne ce lot.

### Une décision d'exploitation, et non de développement

Les **six groupes de départ** de la migration 008 portent 164 attributions de
permission, mais **aucun utilisateur n'y est encore affecté** : les
appartenances comptent zéro. C'était sans conséquence tant que l'écran n'existait
pas ; il existe désormais.

Ces groupes sont des **points de départ modifiables**, la migration 008 le dit
explicitement, et `05_Regles_Metier/05_Permissions.md` §63 le confirme : « les
permissions exactes seront définies par ADIKOM ». Il revient donc au Super Admin
de les relire, de les ajuster, puis d'y affecter les collaborateurs — et
d'établir au passage les responsables de département, que la vue hiérarchique
attend pour dessiner autre chose qu'une liste plate.

Ce n'est pas un arbitrage à trancher : c'est le premier usage du lot.

---

## 17. Pour reprendre le projet

### Où en est le Module 08

| Menu | État |
| --- | --- |
| Nouvel utilisateur | ✔ livré (Phase 1) |
| Liste des utilisateurs | ✔ livré (Phase 1) |
| **Vue hiérarchique** | ✔ **livré — LOT 14** |
| **Nouveau groupe** | ✔ **livré — LOT 14** |
| **Liste des groupes** | ✔ **livré — LOT 14** |
| Journal d'activité | ✗ à livrer — capacité `users.audit.view` déjà au catalogue, table `audit_log` déjà alimentée |

### Ce que la Phase 4 attend encore

1. **Journal d'activité** — dernier menu du `Module 08`. Rien à créer en base :
   `audit_log` est alimentée depuis la migration 004, `users.audit.view` et
   `users.audit.export` sont au catalogue. Il manque l'écran, ses filtres et son
   export.
2. **Module 09 — Paramètres** — `company_settings` et `numbering_rules` existent
   avec leurs policies ; six capacités `settings.*` sont au catalogue. C'est
   aussi là que se règleront les **délais de rappel configurables** de
   l'arbitrage 16.

### Commandes utiles

```bash
npm run db:push              # appliquer les migrations
npm run db:verify:groups     # recette SQL du LOT 14 (19 contrôles)
npm run verify:groups        # recette de production (73 contrôles)
npm run verify               # lint + typecheck + tests + build
```

> **Piège rencontré :** si `npm run typecheck` échoue sur des routes typées
> (`does not satisfy the constraint 'AppRoutes'`) alors que `next build` passe,
> c'est que `.next/dev/types` contient des types partiels laissés par un serveur
> de développement interrompu. Les supprimer, puis relancer.

---

## 18. Bilan

| | |
| --- | --- |
| Contrôles SQL | **19** — tous verts |
| Contrôles de production | **73** — tous verts |
| Contrôles de non-régression | **820** sur les lots précédents — tous verts |
| Tests unitaires | **179** — tous verts |
| Capacités ajoutées | **0** — catalogue à 170 |
| Tables ajoutées | **0** |
| Défauts découverts et corrigés | **5** (3 en base, 2 dans la recette) |
| Arbitrages ouverts ajoutés | **3** |
| Résidus de recette | **aucun** |
| Données DEMO | **intactes** |

---

**ADIKOM PILOT — LOT 14**

> Un groupe rassemble des droits.
> Une hiérarchie dit qui répond de quoi.
> Ni l'un ni l'autre ne s'attribue à soi-même.
