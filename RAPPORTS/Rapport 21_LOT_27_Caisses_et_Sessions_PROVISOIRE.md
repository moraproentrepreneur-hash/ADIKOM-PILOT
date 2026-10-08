# Rapport 21 — LOT 27 · Caisses et sessions de caisse

**⚠ PROVISOIRE — rédigé par Claude Code Cloud, à valider et compléter en local**

| | |
| --- | --- |
| Date | 8 octobre 2026 |
| Nature | **Lot fonctionnel** — module 12 `pos`, partie caisses et sessions |
| Étape de la méthode | **Cloud** (1ʳᵉ étape de Cloud → GitHub → Local → Supabase → GitHub → Vercel) |
| Point de départ | `main` · `32d0fcb` · 107 migrations · 229 capacités · 62 tables sauvegardées · 401 tests |
| Point d'arrivée (branche) | 111 migrations · **238** capacités · **65** tables sauvegardées · **426** tests |
| Branche réelle | **`claude/funny-dirac-l3upkm`** — la plateforme impose le préfixe `claude/` ; aucune branche `lot-27-caisses-sessions` n'a été créée |
| DEC | **DEC-054 — brouillon « provisoire — à valider en local »** consigné au journal |
| Migrations appliquées sur Supabase | 🟥 **Aucune** |
| Déploiement Vercel | 🟥 **Aucun** — `vercel.json` / `vercel.ts` ni créés ni modifiés |

---

# 0. 🟥 À lire d'abord — la branche n'a PAS pu être poussée

Chaque `git push` de la branche a été **refusé par GitHub** :

```
remote: Claude doesn't have GitHub access to moraproentrepreneur-hash/ADIKOM-PILOT for your organization.
fatal: unable to access 'https://github.com/moraproentrepreneur-hash/ADIKOM-PILOT/': The requested URL returned error: 403
```

La voie API a été tentée aussi (`create_branch`) : `403 Resource not accessible by integration`.
La **lecture** du dépôt fonctionne (`git ls-remote` rend `main` à `32d0fcb`) : c'est
l'**écriture** que l'application GitHub Claude n'a pas reçue pour cette organisation.

Les commits existent **dans le conteneur Cloud**, sur la branche locale
`claude/funny-dirac-l3upkm`. Ils seront perdus si la session est récupérée avant
qu'un push aboutisse.

**Remède** (hors de portée du Cloud) : reconnecter GitHub depuis claude.ai
(`https://claude.ai/connect-github`) ou faire installer l'application Claude sur le
dépôt par un propriétaire de l'organisation, avec droit d'écriture ; puis relancer le
push de la branche — le Cloud le fait sur simple demande.

---

# 1. Ce qui a été livré

## 1.1 Fonctionnel

- **Caisses** : déclarer, modifier, désactiver, réactiver. Adossée **obligatoirement** à
  un compte financier **`CASH` actif** — une caisse n'est pas un compte, elle en utilise un.
- **Sessions** : ouvrir (caisse, caissier = l'utilisateur, fond de caisse), clôturer
  (montant compté **obligatoire**). Écart **affiché, journalisé, jamais bloquant**,
  **sans écriture de trésorerie**. Une session close **ne se rouvre pas**.
- **Une session ouverte par caisse ET par utilisateur** — index uniques partiels (B-8).
- **« Qui était en caisse le J entre 10h00 et 11h30 ? »** — fonction
  `pos_sessions_in_window`, index GiST, filtre jour + plage horaire à l'écran.
- **Montants en table sœur** (T-1) : `pos.sessions.view` n'ouvre aucun montant ; un
  caissier voit **les siens**, jamais ceux d'un autre sans `pos.sessions.amounts.view` (B-13).
- **Export** des sessions (`pos.sessions.export`), montants seulement avec `amounts.view`.
- **Bandeau « session ouverte »** réutilisable par le LOT 28.

## 1.2 Documentation

- `00 Documentation/03_Modules/12_Point_de_Vente.md` — **écrit avant toute migration**.
- `CLAUDE.md` §10 — module **12. Point de vente** (`pos`) et ses règles.
- `00 Documentation/08_Decisions/01_Journal_des_Decisions.md` — **DEC-054 provisoire**.

---

# 2. Commits (dans l'ordre)

| SHA | Objet |
| --- | --- |
| `70d25fd` | docs(pos) : module 12 Point de vente, CLAUDE.md §10 |
| `3b2cf6e` | feat(pos) : quatre migrations — schéma, fonctions, capacités, sauvegarde |
| `cf4c953` | test(pos) : recette SQL sous RLS réelle + script npm |
| `0ff1cef` | feat(pos) : écrans, export, navigation, journal, tests Vitest |
| `553eadf` | test(pos) : recette navigateur écrite + responsive |
| *(suivant)* | docs : ce rapport et DEC-054 provisoire |

Le SHA final figure en conclusion du message de livraison.

---

# 3. Fichiers

**Créés**

| Fichier | Rôle |
| --- | --- |
| `00 Documentation/03_Modules/12_Point_de_Vente.md` | Référence fonctionnelle du module |
| `supabase/migrations/20261008000100_caisses_et_sessions_de_caisse.sql` | 108 — types, tables, contraintes, index, gardes, RLS, journal |
| `supabase/migrations/20261008000200_ouvrir_et_cloturer_une_session.sql` | 109 — actes et dérivés |
| `supabase/migrations/20261008000300_capacites_et_numerotation_du_point_de_vente.sql` | 110 — CAI/SES, 9 capacités, **238** |
| `supabase/migrations/20261008000400_perimetre_de_sauvegarde_du_point_de_vente.sql` | 111 — `backup_scope` **65** |
| `supabase/tests/pos_sessions.sql` | Recette SQL (23 contrôles) |
| `scripts/verify-pos-sessions.mjs` | Recette navigateur (écrite, non exécutée) |
| `src/features/pos/{constants,data,actions,panels,open-session-banner}.ts(x)` | Module applicatif |
| `src/features/pos/pos.test.ts` | 25 tests Vitest |
| `src/app/(app)/pdv/caisses/{page,loading}.tsx`, `nouvelle/page.tsx`, `[id]/page.tsx` | Écrans caisses |
| `src/app/(app)/pdv/sessions/{page,loading}.tsx`, `[id]/page.tsx` | Écrans sessions |

**Modifiés**

| Fichier | Modification |
| --- | --- |
| `CLAUDE.md` | §10 : module 12 |
| `src/lib/auth/permissions.ts` | +9 codes `pos.*` (parité TS/SQL verte) |
| `src/lib/navigation.ts` | Section « Point de vente » : Caisses, Sessions de caisse |
| `src/lib/exports/registry.ts` | Entrée `sessions-caisse` |
| `src/features/audit/constants.ts` | Module `pos`, trois objets, libellés de champs |
| `scripts/verify-responsive.mjs` | Trois routes et deux fiches `/pdv/*` |
| `package.json` | `db:verify:pos-sessions`, `verify:pos-sessions` |

**Non touchés** — conformément aux règles : aucune migration existante, aucun code de
capacité existant, aucune fonction de trésorerie, de facturation ou de paiement,
`vercel.json` / `vercel.ts` absents, aucun `.env*`.

---

# 4. Migrations — dans l'ordre d'application

| # | Fichier | Contenu | Contrôles intégrés |
| :-: | --- | --- | --- |
| 108 | `20261008000100_caisses_et_sessions_de_caisse.sql` | enum `pos_session_status` · index `financial_accounts (id, kind)` · tables `pos_registers`, `pos_sessions`, `pos_session_amounts` · unicités ouvertes par caisse et par caissier · GiST de période · gardes de cohérence · contrôle **différé** session ↔ montants · gardes `zzz_…_born_by_function` · journal `CREATE`/`VALIDATE` · RLS (dont **policy par ligne**) · `audit_detail_permission` réécrite **entière** (+3) | RLS, privilèges, ordre des gardes, unicités, GiST, aucun montant sur la session, aucun écart stocké, aucun `SECURITY DEFINER`, acquis du journal |
| 109 | `20261008000200_ouvrir_et_cloturer_une_session.sql` | `create_pos_register`, `update_pos_register`, `set_pos_register_active`, `open_pos_session`, `close_pos_session`, `pos_session_expected`, `pos_session_variance`, `pos_sessions_in_window` | aucun `SECURITY DEFINER`, drapeaux ouverts **et** refermés, `require_capability` présent, aucune écriture de trésorerie, rien d'exécutable par `anon` |
| 110 | `20261008000300_capacites_et_numerotation_du_point_de_vente.sql` | règles `pos_register` (CAI, sans année), `pos_session` (SES, avec année) · 9 capacités, module `pos` ordre 12 | **total 238** (seule assertion de total, DEC-046), aucune capacité inventée, sensibilité, ordre 12 libre |
| 111 | `20261008000400_perimetre_de_sauvegarde_du_point_de_vente.sql` | `backup_scope()` réécrite entière : `financial_accounts → pos_registers → pos_sessions → pos_session_amounts` | **65**, acquis 20–26, ordre paire par paire, TRUNCATE fermé, `backup_columns` |

**Aucune extension d'enum** (`alter type … add value`) : l'énumération est nouvelle.

---

# 5. Capacités — 229 → 238 (C-27)

| Code | Action | Sensible |
| --- | --- | :-: |
| `pos.registers.view` / `.create` / `.update` / `.archive` | VIEW · CREATE · UPDATE · ARCHIVE | |
| `pos.sessions.view` | VIEW | |
| `pos.sessions.open` | CREATE | |
| `pos.sessions.close` | VALIDATE | |
| `pos.sessions.export` | EXPORT | ✓ |
| `pos.sessions.amounts.view` (sous-menu `amounts`) | VIEW | ✓ |

Aucune `variance.view`, `download`, `print`, `pos.sales.*`. **Aucune affectation aux
groupes système** (B-12).

**Capacités exigées par les actes composés** (« une garde qui compte doit compter la
vérité », sans `SECURITY DEFINER`) :

| Acte | Capacités exigées en base |
| --- | --- |
| Déclarer une caisse | `pos.registers.create` + `pos.registers.view` + `treasury.accounts.view` |
| Modifier une caisse | `pos.registers.update` + `pos.registers.view` ; changer de compte : + `treasury.accounts.view` + `pos.sessions.view` |
| Désactiver / réactiver | `pos.registers.archive` + `pos.registers.view` ; désactiver : + `pos.sessions.view` ; réactiver : + `treasury.accounts.view` |
| Ouvrir une session | `pos.sessions.open` + `pos.sessions.view` + `pos.registers.view` + `treasury.accounts.view` (**Q-1**) |
| Clôturer sa session | `pos.sessions.close` + `pos.sessions.view` |
| Clôturer celle d'un autre | + `pos.sessions.amounts.view` (**Q-2**) |

---

# 6. `backup_scope` — 62 → 65

Trois tables et non deux (T-1). Ordre : `financial_accounts` → `pos_registers` →
`pos_sessions` → `pos_session_amounts`. `pos_session_amounts.cashier_id` cite
**directement** `app_users`, pour que la restauration — qui écarte une ligne dont
l'utilisateur obligatoire a disparu — écarte la session **et** ses montants ensemble.

🟥 **Les tables sauvegardées changent** : le cycle destructif **SAUVEGARDE →
RÉINITIALISATION → RESTAURATION redevient obligatoire en local** (`CLAUDE.md` §47 bis).

---

# 7. Choix d'architecture notables

| Sujet | Choix | Pourquoi |
| --- | --- | --- |
| Compte `CASH` | **Clé étrangère composite** `(account_id, account_kind)` → `financial_accounts (id, kind)` | Garantie évaluée sans RLS, durable (le type du compte ne peut plus changer sous une caisse), sans `SECURITY DEFINER` |
| Compte `ACTIVE` | Lecture sous les droits de l'appelant, **échec fermé** ; les actes exigent `treasury.accounts.view` | Seule voie sans `SECURITY DEFINER` (consigne du lot) |
| Copie du caissier sur les montants | Clé composite `(session_id, cashier_id)` → `pos_sessions (id, cashier_id)` | La policy par ligne ne relit pas la session à travers RLS, et la copie ne peut pas mentir |
| « Née par sa fonction » | Étendue à **l'insertion ET la modification** des trois tables | Un `PATCH` direct pourrait sinon clore une session sans montant compté, ou changer le compte d'une caisse en session |
| Journal de clôture | Fonction d'audit dédiée : `VALIDATE` à la clôture ; l'événement des **montants** porte le théorique et l'écart **constatés** | B-9 « audite l'écart » ; Plan 02 §12 ; la session n'y porte aucun montant (DEC-038) |
| Cohérence session ↔ montants | Déclencheur de contrainte **différé** | Une session ouverte a son fond, une session close son compté — vérifié à la validation |

---

# 8. Tests réalisés dans le Cloud

## 8.1 Chaîne du projet

| Contrôle | Résultat |
| --- | --- |
| `npm ci` | ✅ |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run typecheck` | ✅ (après `next typegen`, qui génère `PageProps` — le build le fait aussi) |
| `npm run test` | ✅ **426 / 426**, 20 fichiers (401 existants + 25 du lot) |
| `npm run build` | ✅ avec `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co` et `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder` passées **en ligne de commande**, jamais écrites |

## 8.2 🟩 Exécution réelle des migrations — sur une base PostgreSQL JETABLE

Le conteneur Cloud dispose de **PostgreSQL 16**. Une base **jetable**, locale au
conteneur, sans aucune donnée réelle ni connexion à Supabase, a été montée avec un socle
minimal imitant Supabase (rôles `anon` / `authenticated` / `service_role`, schéma `auth`
avec `auth.uid()` lisant `request.jwt.claims`, schéma `storage`).

| Contrôle | Résultat |
| --- | --- |
| Les **107** migrations de `main`, puis les **4** du lot, depuis une base vide | ✅ **111 appliquées**, toutes leurs assertions passent |
| `supabase/tests/pos_sessions.sql` | ✅ **23 / 23** — dont B-13 sous **`set local role authenticated`** (la RLS est réellement appliquée) |
| Cycle **validé** (COMMIT) ouverture puis clôture sous `authenticated` | ✅ contrôle différé satisfait, écart −1 000 |
| `supabase/tests/backup.sql` avec des données du point de vente | ✅ 15 / 15 — périmètre **65**, réinitialisation puis restauration fidèles (4 lignes `pos`) |
| Les **28** recettes SQL existantes rejouées après le lot | ✅ 25 vertes · ⚠ 3 en échec **identique sur la base de `main`** (voir ci-dessous) |

Les trois échecs — `planning.sql`, `projects.sql`, `settings.sql` — se reproduisent
**à l'identique sur une base au niveau de `main` (107 migrations), sans le LOT 27**. Ils
tiennent à la base jetable **vide** (recettes qui supposent des tiers ou des compteurs
existants), pas au lot. Ils ne sont **pas** des résultats Supabase : à rejouer en local.

> Cette base n'est **pas** Supabase : PostgREST, GoTrue, les privilèges effectifs réels
> et la version de PostgreSQL de production (15 ou 17) diffèrent. Ces résultats
> **réduisent le risque** d'une erreur SQL à l'application ; ils **ne remplacent pas**
> la recette locale.

## 8.3 Ce que couvre `pos_sessions.sql` (23 contrôles)

1 · 9 capacités, sensibilité, aucune inventée — 2 · tables, RLS, privilèges, gardes en
dernier, aucun `SECURITY DEFINER` — 3 · forme des policies — 4 · six profils (deux
caissiers, planning, responsable, gestionnaire, **minimal**) — 5 · décor — 6 · déclarer —
7 · refus : banque, compte inactif, nom vide, **insertion et modification directes**
(`42501`), caissier, minimal — 8 · ouvrir, **B-8** — 9 · **écritures directes** sur
sessions et montants refusées — 10 · **B-13** : A voit les siens, pas ceux de B (et
réciproquement), `view` seul aucun montant, `amounts.view` tous, minimal rien —
**anti-vacuité** à chaque refus — 11 · caisse figée pendant la session — 12 · **B-9** :
compté obligatoire, manque et excédent sans blocage, **Q-2** — 13 · aucune écriture de
trésorerie, journal `CREATE`/`VALIDATE`, écart journalisé sur les montants seulement —
13 bis · contrôle différé satisfait par les actes légitimes — 14 · session close figée —
15 · **B-8 tenue par les index hors fonction**, contrôle différé refusant une session sans
fond — 16-17 · **« qui était en caisse entre 10h00 et 11h30 »**, bornes exactes 10h00 et
11h30 exclues, filtres caisse et caissier — 18 · **l'index GiST est employé** — 19 ·
désactivation/réactivation — 20 · type `CASH` tenu par la clé, compte inactif refusé —
21 · aucune suppression — 22 · sauvegarde ordonnée.

---

# 9. Ce qui n'a PAS pu être exécuté dans le Cloud

| Non exécuté | Raison | Qui |
| --- | --- | --- |
| **Push de la branche** | 🟥 GitHub 403 (§0) | à débloquer |
| `db:status`, `db:push` sur Supabase | pas d'accès, et interdit au Cloud | Local |
| `db:verify:*` contre Supabase | idem | Local |
| `verify:pos-sessions` (Playwright) | base et application réelles | Local |
| `verify:responsive`, `verify:capabilities`, `verify:backup`, `verify:production` | idem | Local |
| Écrans dans un navigateur | aucune pile Supabase (PostgREST + Auth) dans le Cloud : **aucun écran n'a été vu rendu** | Local |
| Cycle de sauvegarde destructif réel | base réelle | Local |
| `demo:seed` / `demo:clean` | base réelle (le lot ne touche pas la démonstration) | Local |
| Contrôle Vercel | jeton absent ; O-1 à constater au premier push | Local |

---

# 10. Risques

| Risque | Niveau | Mesure |
| --- | :-: | --- |
| Branche non poussée — travail présent seulement dans le conteneur | 🟥 | Débloquer l'accès GitHub, puis pousser **avant** toute fin de session |
| Écarts PostgreSQL 16 (jetable) ↔ Supabase | 🟧 | `db:push` puis `db:verify:pos-sessions` en local |
| Écrans jamais rendus avec de vraies données | 🟧 | `verify:pos-sessions`, `verify:responsive`, revue visuelle 390 / 768 / 1440 |
| **Q-1** : un caissier doit détenir `treasury.accounts.view` pour ouvrir | 🟧 | Décision demandée (§11) |
| Clé composite : le type d'un compte adossé ne peut plus changer | 🟩 | Voulu ; aucun écran ne modifie le type d'un compte existant |
| Écran de recherche « qui était en caisse » sans `users.users.view` : nom du caissier « non lisible » | 🟧 | **Q-6** (§11) |
| Liste des sessions bornée à 100 lignes sans fenêtre | 🟩 | L'écran le dit ; la fenêtre interroge la base sans borne |

---

# 11. Questions ouvertes — choix retenus, à confirmer

Conformément à la consigne : *l'option la plus restrictive, nommée comme telle.*

| Réf. | Question | Option retenue | Alternative |
| :-: | --- | --- | --- |
| **Q-1** | Ouvrir une session exige-t-il `treasury.accounts.view` ? | **Oui** (restrictif) — la garde « compte actif » lit la vérité sans `SECURITY DEFINER` ; le LOT 28 l'exigera pour écrire dans ce compte | Une garde `SECURITY DEFINER` dédiée (exception D4 « garde », précédent `fn_supplier_vehicle_rate_guard`, migration 083 `20260914000300`) dispenserait le caissier de cette lecture |
| **Q-2** | Qui clôt la session d'un autre caissier ? | `close` **+** `amounts.view` | Réserver au seul caissier : refusé, crée une impasse (DEC-027 §e) |
| **Q-3** | Changer le compte / désactiver une caisse avec une session ouverte ? | **Refusé** | — |
| **Q-4** | L'observation de clôture se modifie-t-elle ? | **Non**, session close figée | Annotation ultérieure gardée par une capacité |
| **Q-5** | L'export porte-t-il les montants ? | **Seulement** avec `amounts.view` | Montants propres au caissier par ligne |
| **Q-6** | Le profil « planning » voit-il le **nom** du caissier ? | Seulement avec `users.users.view` (policy existante d'`app_users`) ; sinon « Caissier non lisible avec vos droits » | Un annuaire restreint (nom seul) — demanderait une fonction `SECURITY DEFINER` ou une décision sur `app_users` |
| **B-12** | Affectation aux groupes système | Aucune (manuelle) | — |

Aucune de ces questions ne **bloque** le lot.

---

# 12. Ce que la reprise locale doit lancer — liste exacte

Après relecture, contrôle des secrets, `npm ci · lint · typecheck · test · build` et
**sauvegarde préalable** (`npm run backup:snapshot -- avant-lot-27`) :

1. `npm run db:status` → **exactement** les 4 migrations `20261008000100` à `20261008000400`.
2. `npm run db:push`.
3. **Recette du lot** : `npm run db:verify:pos-sessions`.
4. **Dépendances réellement touchées** (`CLAUDE.md` §47 bis) :
   - `npm run db:verify:treasury` — index ajouté sur `financial_accounts`, clé composite ;
   - `npm run db:verify:transfers` — comptes financiers ;
   - `npm run db:verify:audit` — `audit_detail_permission` réécrite entière ;
   - `npm run db:verify:backup` puis `npm run verify:backup` — **périmètre changé** ;
   - `npm run db:verify:settings` — numérotation partagée (2 règles ajoutées) ;
   - `npm run db:verify:purchasing` et `npm run db:verify:commerce` — garde-fous de journal du LOT 26 relus par la migration 108 ;
   - `npm run verify:capabilities` — catalogue 238.
5. **Cycle destructif obligatoire** : SAUVEGARDE → RÉINITIALISATION → RESTAURATION
   (`backup_scope` modifié).
6. Recettes navigateur : `npm run verify:pos-sessions -- <url>`, `npm run verify:responsive -- <url>`.
7. Après fusion et déploiement : `npm run verify:production`.

**Non requis** (non touchés) : location, avenants, facturation client et fournisseur,
règlements, imputations, catalogue, projets.

---

**LOT 27 CLOUD — PROVISOIRE · AUCUNE MIGRATION APPLIQUÉE · AUCUN DÉPLOIEMENT**
