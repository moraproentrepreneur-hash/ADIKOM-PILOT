# Rapport 11 — Réinitialisation du mot de passe et dette du catalogue

**Projet :** ADIKOM PILOT — SaaS interne de gestion et de pilotage
**Lot :** LOT 19 du Plan 02
**Date :** 12 septembre 2026
**Décision de référence :** DEC-046
**Migrations :** 079, 080
**Capacités :** 178 → **179**
**Statut :** livré, déployé, éprouvé en production

---

## 1. Objectif de la mission

Le LOT 19 porte **exactement deux volets**, et rien d'autre.

| Volet | Objet |
|---|---|
| **A** | Permettre à un administrateur autorisé de **réinitialiser le mot de passe** d'un utilisateur existant |
| **B** | **Solder la dette** du total `178` écrit en dur dans 35 fichiers de recette |

Le Plan 02 §15.3 explique pourquoi ce lot vient en premier : aucune décision de
la Direction ne le bloque, il éprouve la nouvelle discipline du catalogue **sur
une seule capacité** plutôt que sur douze, et il solde la dette **avant** que les
six lots suivants n'ajoutent 66 capacités de plus.

Aucun développement de Services, de tarification fournisseur, de Commerce ou de
PDV n'a été entrepris.

---

## 2. Volet A — Réinitialisation du mot de passe

### 2.1 Ce qui existait, et qui ne bouge pas

Le mécanisme du mot de passe temporaire est **validé par le demandeur**. Il a été
vérifié dans le dépôt avant toute écriture, et il est **intact** :

```
1.  L'administrateur ouvre « Nouvel utilisateur »
2.  generateTemporaryPassword()        ← src/lib/auth/password.ts
    16 caractères, crypto.getRandomValues, sans les caractères ambigus
    EXÉCUTÉ DANS LE NAVIGATEUR de l'administrateur
3.  createUserAction → admin.auth.admin.createUser({ password })
    puis app_users.must_change_password = true
4.  À la connexion, requireUser() détourne vers /changer-mot-de-passe
    AUCUNE fonctionnalité métier n'est accessible avant
5.  changePasswordAction : supabase.auth.updateUser({ password })
    puis levée de l'indicateur par le client d'administration
```

**Ce lot n'ajoute aucun mécanisme de mot de passe.** Il ajoute l'orchestration qui
permet de **rejouer celui-là** après la création du compte. Les cinq pièces que le
Plan 02 désigne — `generateTemporaryPassword`, `must_change_password`,
`requireUser`, `changePasswordAction`, `fn_prevent_self_promotion` — sont
réemployées sans modification.

### 2.2 Le parcours livré

```
L'administrateur ouvre la FICHE de l'utilisateur
        ↓
encart « Accès & sécurité » → « Réinitialiser le mot de passe »
        ↓
confirmation qui NOMME la personne et son identifiant
        ↓
generateTemporaryPassword() — LE MÊME, dans le navigateur
        ↓
resetUserPasswordAction
   a. requirePermission('users.users.password.reset')
   b. rpc require_password_reset(p_user_id)
   c. admin.auth.admin.updateUserById(userId, { password })
        ↓
le navigateur affiche LE mot de passe QU'IL A LUI-MÊME GÉNÉRÉ
  · masqué par défaut, œil pour l'afficher
  · bouton « Copier » + confirmation visuelle de copie
  · « Ce mot de passe est temporaire. L'utilisateur devra définir son
    propre mot de passe lors de sa prochaine connexion. »
        ↓
l'utilisateur se connecte avec le temporaire
        ↓
requireUser() le détourne vers /changer-mot-de-passe
        ↓
il choisit son mot de passe définitif
```

**Le serveur ne renvoie jamais le mot de passe.** Ce qui s'affiche après
l'opération est la valeur que la page détenait déjà. L'administrateur ne connaît
**jamais** le mot de passe définitif : il n'existe que dans Supabase Auth, sous
forme d'empreinte.

### 2.3 Pourquoi l'acte vit sur la fiche

Le Plan 02 §4.2 a tranché, et la livraison le respecte :

| | Ce qui a été fait |
|---|---|
| **La fiche** | porte **l'acte**, dans un encart « Accès & sécurité » voisin du statut — là où vivent déjà les actes sensibles. L'identité est **sous les yeux** : nom, identifiant, fonction, statut |
| **La liste** | porte une **information**, jamais l'acte : un badge « Mot de passe temporaire » dérivé de `must_change_password`, qui montre d'un coup d'œil qui n'a pas encore défini le sien |

Réinitialiser depuis une ligne de liste, c'est risquer de verrouiller une personne
qui n'avait rien demandé. Un clic de plus, une erreur de moins.

### 2.4 L'ordre des deux écritures

C'est le point le plus important de la conception, et il n'est pas indifférent.

| Ordre | Si la seconde étape échoue |
|---|---|
| **Indicateur, puis Auth** ✅ | L'utilisateur garde son ancien mot de passe **mais devra le changer**. Dégradé, sûr, **réessayable** |
| Auth, puis indicateur | L'utilisateur a un temporaire **sans obligation de le changer** : le temporaire devient définitif, **connu de l'administrateur**. Inacceptable |

L'indicateur est donc levé d'abord, **en base, sous la session de
l'administrateur**. Le mot de passe n'est écrit qu'ensuite. Si l'écriture dans
Auth échoue, l'écran le dit et invite à relancer l'opération.

---

## 3. La capacité ajoutée

| Code | Module | Menu | Sous-menu | Action | Sensible | Libellé |
|---|---|---|---|---|:-:|---|
| `users.users.password.reset` | `users` | `users` | `password` | `ADMIN` | ✓ | Réinitialiser le mot de passe |

**Catalogue : 178 → 179.**

**Pourquoi elle n'est pas incluse dans `users.users.update`** — DEC-024 :
corriger un numéro de téléphone et **rendre un accès** ne sont pas le même geste.
Un poste chargé de tenir les fiches à jour n'a aucune raison de pouvoir ouvrir un
compte à la place de son titulaire.

**Pourquoi `ADMIN` et non `UPDATE`** : le précédent est `rental.pricing.override`
(« Forcer un tarif manuellement »). Réinitialiser ne modifie pas une donnée de la
fiche, c'est un acte d'administration **sur un compte**.

**Aucune autre capacité n'a été créée.** Ni `password.view`, ni `password.send`,
ni `password.generate` : le SaaS ne propose ni l'envoi d'un lien, ni la lecture
d'un mot de passe, et une permission qui ne débloque rien ne s'attribue pas
(CLAUDE.md §19 bis). Un test et deux recettes le vérifient.

**Aucune capacité existante n'a été modifiée, renommée ou retirée.**

---

## 4. Sécurité — trois couches, aucune ne suffisant seule

### 4.1 Le point technique délicat

L'écriture du mot de passe dans Supabase Auth **exige la clé de service** : elle
ne peut pas, par nature, être gardée par RLS. La garde en base porte donc sur ce
qui est gardable — **l'indicateur et le journal**.

Or `app_users_update` (migration 006) ouvre l'écriture à `users.users.update`.
S'en contenter aurait rendu la réinitialisation **implicitement incluse** dans
« modifier un utilisateur », ce que DEC-024 interdit. D'où trois pièces.

### 4.2 Les trois couches

| # | Couche | Ce qu'elle tient |
|---|---|---|
| 1 | **Action serveur** — `resetUserPasswordAction` | `requirePermission('users.users.password.reset')` en première instruction |
| 2 | **Policy dédiée** — `app_users_password_reset` | ouvre l'écriture d'`app_users` à cette capacité **seule**. Elle ne cite **jamais** `users.users.update` — une recette le vérifie |
| 3 | **Déclencheur** — `fn_password_reset_guard` | refuse, par cette voie, toute écriture portant sur une **autre colonne** que `must_change_password` |

La troisième couche n'est pas une précaution : **RLS est ROW-level**. Sans elle,
la policy aurait ouvert la ligne entière — nom, email, téléphone, fonction,
statut, et **rôle Super Admin**.

La forme du déclencheur est celle de `fn_prevent_self_promotion`, qui restreint
déjà des **colonnes**. `has_permission(...)` est enveloppée dans un sous-select
dans la policy : une garde de RLS s'évalue **par ligne**, et l'appel coûterait
sinon un aller-retour par ligne de la table.

### 4.3 Les trois refus

| Refus | Pourquoi | Où il est opposé |
|---|---|---|
| Nul ne réinitialise **son propre** mot de passe par cette voie | L'écran de changement existe déjà ; passer par ici n'apporterait rien et brouillerait le journal | action serveur **+ RPC + déclencheur** |
| Un non-Super-Admin ne réinitialise **jamais** le mot de passe d'un **Super Admin** | Sinon la capacité devient **un chemin de prise de contrôle** : qui réinitialise le mot de passe du Super Admin se connecte à sa place, et s'attribue tout le reste | **RPC + déclencheur** |
| Un compte **`ARCHIVED`** ne se réinitialise pas | On le réactive d'abord. Réinitialiser un compte archivé rendrait un accès à quelqu'un qui n'en a plus | **RPC + déclencheur**, pour **tout acteur** |

Le refus du compte archivé est une **règle de cohérence** : il est posé **avant**
la distinction d'acteur, donc il vaut aussi pour la **clé de service**. Placer
`current_actor() is null` en tête l'aurait effacé pour elle — un défaut de cette
nature s'est déjà produit (migration 055). La recette l'éprouve dans les deux cas.

### 4.4 Doctrines respectées

- **Aucune fonction métier `SECURITY DEFINER`** (doctrine D4).
  `require_password_reset` et `fn_password_reset_guard` sont **`security
  invoker`** : l'écriture passe par les policies de l'appelant. Deux contrôles le
  vérifient en base.
- **`require_capability()` en première instruction** de `require_password_reset`.
- **`revoke all … from public`**, `grant execute … to authenticated,
  service_role`. `anon` ne l'atteint pas — la recette l'éprouve.
- **`users.users.view` est exigée explicitement.** Un `UPDATE` sous RLS **lit**
  les lignes qu'il vise : sans droit de lecture, l'écriture ne modifierait rien et
  **ne dirait rien** — zéro ligne touchée, aucune erreur. La fonction exige donc
  la lecture, puis **vérifie son effet** au lieu de le supposer.
- **Aucune suppression physique** d'utilisateur. **Aucun changement de schéma**
  hors la policy et le déclencheur.

---

## 5. Audit

Le journal enregistre **qui a demandé la réinitialisation, pour quel
utilisateur, quand, et que l'opération a eu lieu**.

Il **n'enregistre jamais** : le mot de passe en clair, son empreinte, la valeur
du temporaire, ni aucun contenu permettant de le retrouver.

Trois raisons structurelles, et non trois précautions :

1. **`app_users` ne comporte aucune colonne de mot de passe** — un contrôle
   refuse qu'il en apparaisse une.
2. **La base ne connaît aucun mot de passe.** `require_password_reset` n'en reçoit
   pas en paramètre : l'écriture dans Auth appartient à l'appelant.
3. **`fn_audit_redact`** efface par construction toute clé nommée `password`,
   `encrypted_password`, `token`, `secret` — un contrôle le vérifie encore.

Une **entrée explicite** accompagne le changement d'indicateur. Sans elle, une
réinitialisation portant sur un compte **déjà** en attente de changement
n'aurait laissé **aucune trace** : le déclencheur d'audit ne journalise que les
écritures qui modifient réellement une donnée.

La recette applicative fait mieux qu'un contrôle de forme : elle **connaît** le
mot de passe temporaire et le mot de passe définitif, et les cherche
**littéralement** dans 400 entrées du journal. Aucun n'y figure.

---

## 6. Volet B — La dette du catalogue

### 6.1 Le constat

Le nombre `178` était écrit en dur dans **35 fichiers** :

| Forme | Où |
|---|---|
| `if v_total <> 178 then` | 18 recettes SQL |
| `check(total === 178, …)` | 16 recettes applicatives |
| `perms.includes('sur 178')` | 2 contrôles d'écran dans `verify-groups` |
| `value: '178'` | la page publique |

Chaque capacité ajoutée par un lot faisait donc tomber 35 recettes **pour une
raison sans rapport avec ce qu'elles éprouvent**. Le Plan 02 chiffre le coût des
six lots à venir à **plus de deux cents éditions**, chacune une occasion de casser
une recette.

### 6.2 Ce qui est vérifié à la place — plus strict, pas moins

| Ce qui remplace le total | Pourquoi c'est plus fort |
|---|---|
| **Présence nominative** des codes qu'une recette éprouve, et **absence nominative** de ceux que son lot ne doit pas avoir créés | Un total ne dit pas **quelle** capacité manque |
| **Égalité d'ensembles** entre le catalogue déployé et le catalogue déclaré, **code par code** (`scripts/lib/capabilities.mjs`) | Un total laisse passer un **échange** : une capacité créée, une autre disparue |
| Le nombre **lu dans la base** là où une recette confronte un écran au catalogue complet | La recette n'a plus à savoir combien il y en a |
| La page publique **dérive** son chiffre du catalogue typé | Elle ne peut plus être faussement précise |

**Deux recettes SQL n'avaient que le total** — `customer_invoices` et
`customer_payments`, plus `supplier_invoices` et `treasury` dont le contrôle était
purement quantitatif. Elles **nomment désormais leurs capacités**, une à une, et
nomment aussi celles que leur lot ne doit pas avoir créées.

**Le total reste affirmé une fois**, dans la migration 079 qui le rend vrai. Une
migration énonce un **fait daté** et n'a jamais à être rouverte ; les migrations ne
sont rejouées que dans l'ordre. C'est le seul endroit légitime.

### 6.3 La porte est fermée, pas confiée à la discipline

Un test nouveau — `n'affirme le total du catalogue que dans une migration` —
parcourt les recettes SQL, les recettes applicatives et la page publique, et
refuse qu'une **comparaison au total** y reparaisse.

Il cherche la **forme** de la dette (`<> 179`, `=== 179`, `sur 179`, `à 179`) et
non le nombre seul : un montant ou un kilométrage peut légitimement valoir ce
nombre. **Il se met à jour tout seul** — le nombre cherché est celui du catalogue
lu depuis les migrations.

Il a été éprouvé **par contre-épreuve** : la dette réinjectée dans une recette
fait immédiatement échouer le test, en nommant le fichier.

---

## 7. Fichiers modifiés

### 7.1 Migrations

| Fichier | Objet |
|---|---|
| `supabase/migrations/20260912000100_reinitialisation_du_mot_de_passe.sql` | **079** — la capacité, la policy dédiée, le déclencheur, le RPC, et **l'unique assertion du total (179)** |
| `supabase/migrations/20260912000200_un_horodatage_de_connexion_n_est_pas_une_donnee_du_compte.sql` | **080** — correction du défaut trouvé par `verify:audit` (§9) |

### 7.2 Volet A — application

| Fichier | Modification |
|---|---|
| `src/lib/auth/permissions.ts` | `USERS_PASSWORD_RESET` ajoutée, avec le motif de son indépendance |
| `src/features/users/actions.ts` | `resetUserPasswordAction` ; `friendlyError` transmet les refus que la base formule pour l'utilisateur |
| `src/features/users/password-reset-form.tsx` | **nouveau** — bouton, confirmation nommée, temporaire masqué/affichable/copiable |
| `src/features/users/data.ts` | `mustChangePassword` exposé sur la liste et la fiche |
| `src/app/(app)/utilisateurs/[id]/page.tsx` | encart « Accès & sécurité » et badge d'en-tête |
| `src/app/(app)/utilisateurs/page.tsx` | badge « Mot de passe temporaire » (tableau **et** cartes mobiles) |

### 7.3 Volet B — dette du catalogue

| Fichier | Modification |
|---|---|
| `scripts/lib/capabilities.mjs` | **nouveau** — lit le catalogue typé, compare les deux ensembles code par code |
| 16 × `scripts/verify-*.mjs` | le total en dur remplacé par `checkCatalogue(admin, check)` |
| 18 × `supabase/tests/*.sql` | le total en dur remplacé par des contrôles nominatifs |
| `src/app/page.tsx` | le chiffre est dérivé du catalogue typé |
| `src/lib/auth/permissions.test.ts` | le garde-fou contre le retour de la dette, et le contrôle de la nouvelle capacité |

### 7.4 Recettes et documentation

| Fichier | Modification |
|---|---|
| `supabase/tests/password_reset.sql` | **nouveau** — 15 contrôles en base |
| `scripts/verify-password-reset.mjs` | **nouveau** — 43 contrôles, parcours complet et appels directs |
| `package.json` | `db:verify:password-reset`, `verify:password-reset` |
| `00 Documentation/08_Decisions/01_Journal_des_Decisions.md` | **DEC-046** consignée ; DEC-043 à DEC-045 **réservées** aux lots à venir, pour que leurs numéros ne soient pas réemployés |

---

## 8. Tests exécutés

### 8.1 Contrôles de qualité

| Contrôle | Résultat |
|---|---|
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run typecheck` | ✅ |
| `npm test` | ✅ **222 tests**, 13 fichiers |
| `npm run build` | ✅ |

### 8.2 Recettes SQL

Les **22 recettes** ont été rejouées après les modifications du volet B :

`socle` · `location` · `analytics` · `audit_journal` · `backup` ·
`customer_invoices` · `customer_payments` · `dashboard` · `groups` ·
`imputations` · `incidents` · `maintenance` · `maintenance_costs` ·
`notifications` · `planning` · `projects` · `rental_cycle` · `settings` ·
`supplier_invoices` · `transfers` · `treasury` · **`password_reset`**

**Toutes passent.** Aucune n'a été affaiblie : chacune a gagné des contrôles
nominatifs là où elle perdait un total.

### 8.3 Recette SQL du lot — 15 contrôles

1. `users.users.password.reset` existe, `ADMIN`, sensible, et **seule** sous son sous-menu
2. Policy dédiée présente, gardée par la seule capacité de réinitialisation — et **ne citant pas** `users.users.update`
3. Déclencheur présent, **aucune fonction `SECURITY DEFINER`**, `anon` exclu
4. Aucune colonne de mot de passe dans tout le schéma ; le journal redacte toujours
5. Cinq comptes de recette, aux capacités exactes
6. L'acte aboutit, et le journal le nomme
7. Aucune valeur de mot de passe, en clair ni en empreinte, au journal
8. `users.users.update` **ne réinitialise pas** : ni par la fonction, ni par `UPDATE` direct
9. **Huit colonnes tentées, huit refusées** ; la fiche est intacte
10. L'auto-réinitialisation est refusée, par la fonction **et** en direct
11. Le Super Admin reste hors de portée d'un non-Super-Admin, par la fonction **et** en direct
12. Un compte archivé ne se réinitialise pas, **quel que soit l'acteur** — clé de service comprise
13. Sans `users.users.view`, l'acte est **refusé**, et non silencieusement sans effet
14. `must_change_password` et `app_users_no_self_promotion` sont **intacts**
15. La connexion d'un compte ordinaire reste journalisée ; l'horodatage d'autrui est protégé

### 8.4 Recette applicative du lot — 43 contrôles

**Tests positifs**

| Ce qui est éprouvé | Résultat |
|---|---|
| L'encart « Accès & sécurité » est présent sur la fiche | ✅ |
| La confirmation **nomme** la personne et son identifiant | ✅ |
| Le temporaire est **affiché** (16 caractères), **masqué par défaut**, révélé par l'œil, **copiable** | ✅ |
| L'écran dit qu'il est temporaire et annonce le changement obligatoire | ✅ |
| La liste porte le badge « Mot de passe temporaire » | ✅ |
| L'indicateur est levé en base | ✅ |
| **La connexion avec le temporaire réussit** | ✅ |
| **Le collaborateur est détourné vers l'écran de changement** | ✅ |
| Le tableau de bord reste fermé tant que le temporaire n'est pas remplacé | ✅ |
| **Le mot de passe définitif est accepté, et le SaaS s'ouvre** | ✅ |
| **L'ancien temporaire est devenu invalide** | ✅ |
| **Le nouveau mot de passe fonctionne** | ✅ |
| Le porteur de `users.users.update` peut toujours modifier la fiche | ✅ |

**Tests négatifs — profils minimaux, appels directs**

| # | Ce qui est refusé | Par quoi |
|---|---|---|
| 1 | `users.users.update` **sans** `password.reset` → réinitialisation refusée, **écran et RPC et PATCH direct** | RPC + déclencheur |
| 2 | `password.reset` **sans** `users.users.update` → **huit colonnes** tentées par appel direct (nom, prénom, email, téléphone, fonction, statut, `is_super_admin`, notes), **huit refusées** ; la fiche est inchangée | déclencheur |
| 3 | Non-Super-Admin → réinitialisation du **Super Admin d'ADIKOM** refusée, et son indicateur **relu** pour s'en assurer | RPC + déclencheur |
| 4 | Réinitialisation de **son propre** compte refusée | RPC + déclencheur |
| 5 | **Aucun mot de passe** au journal — le temporaire et le définitif cherchés **littéralement** dans 400 entrées, plus toute empreinte `$2a/$2b/$2y` | structure |
| 6 | Compte **archivé** refusé | RPC + déclencheur |
| 7 | `anon` n'atteint pas `require_password_reset` | `revoke` |

Les comptes de recette sont créés avec **leurs capacités exactes** — aucun ne
cumule deux capacités voisines, car c'est le cumul qui masquerait le défaut.

### 8.5 Recettes transversales

| Recette | Résultat |
|---|---|
| `verify:capabilities` | ✅ **217 contrôles** — catalogue à **179**, identique au code |
| `verify:responsive` | ✅ **329 contrôles**, 300 boutons mesurés |
| `verify:groups` | ✅ **73 contrôles** — l'écran annonce bien « sur 179 », lu depuis la base |
| `verify:audit` | ✅ **82 contrôles** — c'est elle qui a trouvé le défaut du §9 |
| `verify:production` | ✅ **56 contrôles** |
| `db:verify:backup` | ✅ **15 contrôles** — catalogue intact après réinitialisation et restauration |

**Aucun résidu laissé par ce lot.** Les recettes SQL s'annulent par `rollback` ;
les recettes applicatives balaient **par marqueur** (`recette.pwd.%`), et non
seulement par identifiant suivi — un passage interrompu laisserait sinon des
comptes invisibles au nettoyage. Le balayage a été vérifié après une interruption
réelle (§9.3) : **0 compte restant**.

Le balayage final confirme : **0 profil** de recette ou de diagnostic, catalogue
à **179**. Un compte d'authentification orphelin **antérieur d'une semaine** a
été trouvé et **signalé sans être supprimé** (§9.4).

---

## 9. Corrections apportées en cours de lot

### 9.1 Un horodatage de connexion n'est pas une donnée du compte — migration 080

**C'est le défaut le plus instructif du lot.**

La garde de colonnes de la migration 079 excluait `updated_at` et `updated_by`,
et rien d'autre. Or **`record_login()` met à jour `last_login_at` à chaque
connexion**, sous la session de l'utilisateur qui vient de se connecter. Pour
tout compte dépourvu de `users.users.update` — **la quasi-totalité des
collaborateurs** — le déclencheur levait donc une exception :

- la connexion n'était plus journalisée ;
- « Dernière connexion » cessait de se mettre à jour sur la fiche.

**Et c'était silencieux.** `signInAction` n'examine pas le résultat de
`record_login()` : la connexion aboutissait, la trace disparaissait. **Aucune
recette du lot 19 ne l'a vu** — aucune n'éprouvait la connexion d'un compte
ordinaire. C'est la recette du **journal d'activité**, qui vérifie depuis le
LOT 15 que « les connexions continuent d'être journalisées », qui l'a arrêté.

**C'était une erreur de qualification, non un oubli de colonne.**
`last_login_at` n'est pas une donnée que l'on **renseigne** sur un compte, comme
un téléphone : elle est **produite par l'acte de se connecter**. Le déclencheur
d'audit fait d'ailleurs la même distinction depuis l'origine.

**La correction n'ouvre pas la colonne pour autant.** L'exclure purement et
simplement laisserait un porteur de `users.users.password.reset` **forger**
l'horodatage de connexion de n'importe qui, et faire passer un compte dormant
pour actif. Or `record_login()` n'écrit **que sur la ligne de l'acteur** : la
tolérance suit exactement cette frontière.

| Cas | Verdict |
|---|---|
| `last_login_at` sur **sa propre** ligne | toléré — c'est la connexion |
| `last_login_at` sur la ligne **d'autrui** | protégé comme toute autre colonne |

Aucun nom de rôle n'est invoqué, et la recette conserve toute sa portée : ses
écritures directes visent la ligne d'un **autre** compte.

La migration porte **son propre contrôle de non-régression**, et la recette du
lot a gagné un **contrôle 15** qui éprouve la connexion d'un compte ordinaire —
à l'endroit même où le défaut s'est produit.

### 9.2 Une lecture qui échoue n'est pas un journal vide

La recette applicative interrogeait `audit_log` en ordonnant sur `created_at` —
la colonne s'appelle **`occurred_at`**. La lecture échouait, rendait `null`, et le
contrôle affichait « la réinitialisation n'est pas journalisée ». La
fonctionnalité était correcte ; c'était la recette qui avait tort.

La recette **nomme désormais l'échec de lecture** au lieu de l'assimiler à une
absence, et vérifie qu'elle a bien lu quelque chose avant de conclure qu'il n'y a
pas de fuite. Un balayage qui n'a rien lu ne prouve rien.

### 9.3 Deux intermittences de transport, distinguées des défauts

| Recette | Ce qui s'est passé |
|---|---|
| `verify:production` — 1ᵉʳ passage | 2 échecs ; **deux passages consécutifs ensuite : 56/56**. La recette réessaie trois fois chaque lecture et nomme celles qui n'ont jamais abouti |
| `verify:groups` — 1ᵉʳ passage | `waitForURL` en délai dépassé à la connexion ; son nettoyage **a bien été exécuté**, et le balayage par marqueur a confirmé **0 résidu**. Passage suivant : 73/73 |
| `verify:audit` — 2ᵉ passage | un contrôle d'URL lu après une navigation inachevée ; passage suivant : 82/82 |

Ces trois cas relèvent de l'aléa du lien vers la production, non du SaaS. Ils sont
consignés ici parce qu'un rapport qui ne montrerait que les passages réussis
serait moins utile.

### 9.4 Un résidu antérieur, signalé et non supprimé

Le balayage final a trouvé **un compte d'authentification orphelin**, sans profil
métier :

```
recette.set.redacteur.330365@adikom.test   créé le 5 septembre 2026
```

Il vient de `verify:settings`, **une semaine avant ce lot** : son profil
`app_users` a bien été supprimé, la ligne `auth.users` a survécu. Il n'ouvre
aucun accès — sans profil, `getCurrentUser()` rend `null` et la session est
renvoyée à l'écran de connexion.

**Il n'a pas été supprimé**, pour deux raisons :

1. il est **hors du périmètre** du LOT 19 ;
2. le seul outil prévu, `cleanup:test-users`, est **trop large** : son inventaire
   propose la suppression de neuf comptes, dont les **collaborateurs réels
   d'ADIKOM** et les trois comptes **DEMO**. Le lancer aurait détruit des données
   qui ne sont pas des résidus.

Deux pistes, à arbitrer hors de ce lot : retirer cette seule ligne à la main, ou
faire en sorte que les recettes suppriment le compte d'authentification **avant**
le profil — l'ordre inverse laisse l'orphelin lorsqu'un passage s'interrompt
entre les deux.

### 9.5 Un littéral de tableau malformé

`v_ignore || 'last_login_at'` laisse Postgres interpréter la chaîne comme un
**tableau**, et échoue. `array_append` a remplacé la concaténation. Le défaut a
été arrêté par le contrôle de non-régression **de la migration elle-même**, qui a
refusé de s'appliquer.

---

## 10. Git, déploiement et production

| | |
|---|---|
| **Branche** | `main` |
| **Dépôt** | `moraproentrepreneur-hash/ADIKOM-PILOT` |
| **Commits** | `f1f799d` · `0d0e5a0` · `8cf4c47` · `bc1627d` · `7444b36` |
| **SHA du code éprouvé en production** | **`bc1627d`** |
| **SHA déployé** | **`7444b36`** — `bc1627d` **plus ce rapport**, sans aucune modification de code |
| **URL de production** | **https://adikom-pilot.vercel.app** |
| **État Vercel** | `READY` · `production` |

### Les commits

| SHA | Message |
|---|---|
| `f1f799d` | `docs: les deux plans de reference du chantier tarification, location, commerce et PDV` |
| `0d0e5a0` | `refactor: le total du catalogue des capacites ne s affirme plus en trente-cinq endroits` |
| `8cf4c47` | `feat: reinitialisation du mot de passe par un administrateur autorise` |
| `bc1627d` | `fix: un horodatage de connexion n est pas une donnee du compte` |
| `7444b36` | `docs: le rapport du LOT 19, contre le sha bc1627d reellement deploye` |

**Les recettes de production ont été exécutées contre `bc1627d`**, dernier
commit portant du code. `7444b36` n'ajoute que ce rapport : le `diff` entre les
deux ne touche aucun fichier de `01_Developpement/`, et le déploiement de
`7444b36` sert exactement le même applicatif.

**Aucun secret n'a été commis.** Le diff a été relu au motif
(`service_role_key`, `eyJ…`, `sbp_`, `ghp_`, `SUPABASE_SERVICE`) : rien. `.env.local`
reste hors du dépôt.

### Recette de production

Exécutée **contre le déploiement réel**, pas contre un build local :

| Recette | Cible | Résultat |
|---|---|---|
| `verify:password-reset` | `https://adikom-pilot.vercel.app` | ✅ **43 contrôles, tous réussis** |
| `verify:production` | `https://adikom-pilot.vercel.app` | ✅ **56 contrôles, tous réussis** |
| `verify:responsive` | `https://adikom-pilot.vercel.app` | ✅ **329 contrôles**, 342 boutons mesurés |
| `verify:groups` | `https://adikom-pilot.vercel.app` | ✅ **73 contrôles, tous réussis** |
| `verify:audit` | `https://adikom-pilot.vercel.app` | ✅ **82 contrôles, tous réussis** |

Le parcours complet — réinitialisation, connexion avec le temporaire,
détournement obligatoire, choix du mot de passe définitif, invalidité de l'ancien
temporaire — a été éprouvé **en production**.

---

## 11. Ce que ce lot n'a pas fait

- **Aucun lot suivant n'a été entamé.** Ni `services`, ni `service_categories`,
  ni `service_variants`, ni `service_variant_prices`, ni `service_variant_costs`,
  ni tarification fournisseur, ni Commerce, ni PDV. Le seul catalogue touché est
  celui des **permissions**.
- **Aucune capacité existante** n'a été modifiée, renommée ou retirée.
- **Aucun mécanisme de mot de passe** n'a été réécrit.
- **Aucune policy existante** n'a été affaiblie : `app_users_update` demeure
  inchangée, et une recette refuse sa disparition.
- **Aucune règle métier inventée.** Les trois refus, l'emplacement de l'acte et
  l'ordre des écritures viennent du Plan 02 §4.2.
- **Aucune refonte visuelle.** L'encart et les badges empruntent les composants et
  les jetons existants.

---

## 12. Conclusion

Le LOT 19 est livré, déployé et éprouvé en production.

**Volet A.** Un administrateur autorisé peut réinitialiser le mot de passe d'un
collaborateur depuis sa fiche, obtenir un temporaire copiable, et le lui
transmettre. Le mécanisme existant est **rejoué**, pas remplacé :
l'administrateur ne connaît jamais le mot de passe définitif, et le journal
n'apprend jamais le temporaire. La capacité est **indépendante** de « modifier un
utilisateur », gardée par **trois couches** dont deux en base, et les **trois
refus** de sécurité sont opposés **y compris sur appel direct**.

**Volet B.** Le total du catalogue ne se compte plus en trente-cinq endroits. Ce
qui le remplace est plus strict : la **présence nominative** des codes éprouvés,
et une **égalité d'ensembles** entre la base et le code. Un test ferme la porte au
retour de la dette, et il a été éprouvé par contre-épreuve. Les six lots à venir
pourront ajouter leurs 66 capacités **sans toucher une seule recette** pour une
raison de comptage.

**Le lot a produit un défaut, et son propre dispositif de recettes l'a trouvé
avant la clôture.** La garde de colonnes avait rangé l'horodatage de connexion
parmi les données du compte : elle interrompait silencieusement la journalisation
des connexions de presque tous les collaborateurs. La recette du journal
d'activité, écrite quatre lots plus tôt, l'a arrêté. C'est la leçon la plus utile
du lot : **une garde qui restreint des colonnes doit savoir ce qu'est une donnée
du compte, et ce qui n'est que la trace d'un acte.**

**Catalogue : 178 → 179.**

---

**ADIKOM PILOT — LOT 19**

> Lire d'abord.
> Comprendre ensuite.
> Construire proprement.
> Tester réellement.
> Versionner avec rigueur.
