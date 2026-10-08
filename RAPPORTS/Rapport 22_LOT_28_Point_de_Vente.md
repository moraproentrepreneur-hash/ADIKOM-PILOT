# Rapport 22 — LOT 28 · Point de vente : ventes et encaissement

**🟩 DÉFINITIF — validé en local et sur Supabase le 8 octobre 2026.** Le corps du rapport
(§0 à §12) est celui du Cloud, conservé pour l'historique ; la section **V** fait foi. Les
résultats obtenus dans le Cloud sur PostgreSQL 16 **jetable** n'y comptent pas comme validation.

| | |
| --- | --- |
| Date | 8 octobre 2026 |
| Nature | **Lot fonctionnel** — module 12 `pos`, ventes et encaissement · lot touchant la trésorerie |
| Point de départ | `main` · `00f2d3c` (LOT 27 validé) · 111 migrations · 238 capacités · 65 tables |
| Point d'arrivée | **122** migrations · **246** capacités · **69** tables sauvegardées · 454 tests |
| Branche | `lot-28-recuperation-cloud` — 9 commits Cloud (`f9535c6`…`0f650cb`) **intacts**, fusion de `main` (`ebfbea1`), compléments locaux |
| DEC | **DEC-055 définitive**, §d : décisions **Q-10** et **Q-13** |

---

# V. Validation locale — ce qui fait foi

## V.1 Récupération

Push Cloud refusé (403) : bundle vérifié (`a0b907c` → `0f650cb`), récupéré sans modifier un
SHA, publié sous `lot-28-recuperation-cloud`. Aucun secret, aucun `.env*`, aucun `vercel.*`.
Chaque push de branche : Preview Vercel `CANCELED` (O-1 tenue).

## V.2 Ce que le local a ajouté

| Commit | Contenu |
| --- | --- |
| `ebfbea1` | fusion de `main` (LOT 27 validé) — sans conflit, sans rebase |
| `5116106` | **Q-10** (migration **121** `20261009001000_facturer_une_vente_anonyme`) · **Q-13** (migration **122** `20261009001100_valoriser_les_couts_manquants`) · écrans (client à la facture, carte « Coûts et marge ») · **navigation fusionnée** : une section « Point de vente » (Caisse, Ventes, Sessions de caisse, Caisses) |
| `7799bdd` | `pos_sales.sql` **§21 (Q-10)** et **§22 (Q-13)** ; `verify-pos-sales.mjs` lit la page après le squelette de chargement (défaut démontré au LOT 27) |
| `ae9e5eb` | DEC-055 définitive, rapport de reprise |

**Q-10** — `invoice_pos_sale(vente, échéance, client)` : une vente **anonyme** reçoit son client
au moment de la facture, **une seule fois**, dans la même transaction (drapeau
`adikom.pos_client_attach`) ; la garde de la vente (reprise de 116) n'admet que NULL → client,
sur vente validée ; policy d'UPDATE (reprise de 116) ouverte à qui facture, pour une vente
encore anonyme ; journal `UPDATE` avant/après ; aucun montant ni écriture de trésorerie.

**Q-13** — `value_pos_sale_costs(vente?)` : exige `catalog.services.cost.update` **et**
`.cost.view` ; copie le coût **en vigueur le jour de la vente** aux lignes **sans** coût,
n'en remplace jamais un ; une ligne sans coût ce jour-là reste « inconnue » (aucune marge
fictive). Policy d'insertion des coûts (reprise de 116) ouverte à `.cost.update`, lecture
**inchangée** (`.cost.view` seule). **Aucun `SECURITY DEFINER`, aucune capacité, aucune table.**

## V.3 Base — migrations réellement appliquées

Sauvegarde préalable `SAUVEGARDES_ADIKOM/adikom-pilot-avant-lot-28-2026-10-08T10-01-30.json`
(65 tables, 221 lignes, relue et comparée). `db:status` → exactement **112 à 122** ; `db:push`
→ les 11 appliquées, contrôles intégrés compris. `db:status` ensuite : *up to date*.

## V.4 Tests réellement exécutés (Supabase réel)

| Contrôle | Résultat |
| --- | --- |
| lint · typecheck · Vitest (dont parité TS ↔ SQL) · build | ✅ · ✅ · **454/454** · ✅ |
| `db:verify:pos-sales` — 60 000 dus / 100 000 donnés → **40 000 de monnaie, 60 000 en trésorerie** ; facture sur demande **sans mouvement** ; mixte réparti par compte ; règlement adossé fictif ou en double refusé ; annulation B-10 sans effacement ; P-4 ; D-1 ; **Q-10** ; **Q-13** | ✅ **27/27** |
| `db:verify` : customer-invoices 21 · customer-payments 19 · treasury 19 · transfers 20 · supplier-invoices 22 · commerce 29 · purchasing 29 · catalog 19 · pos-sessions 23 · audit 17 · backup 15 · billing 20 · dashboard 15 · analytics 15 | ✅ 14/14 |
| **Cycle réel** sauvegarde → réinitialisation → restauration (`verify:backup`, **69** tables) | ✅ 50/50, 221 lignes restaurées |
| `verify:capabilities` | ✅ 217/217 (deux interruptions **réseau** — 502, puis lecture vide — rejouées, démontage vérifié) |
| `verify:pos-sales` · `verify:customer-payments` · `verify:supplier-invoices` · `verify:payments` · `verify:responsive` (local) | ✅ 22/22 · 36/36 · 37/37 · 32/32 · 539/539 |
| Production — voir V.6 | |

Non rejoués (§47 bis, non touchés) : location, avenants, imputations, projets, planning,
notifications. Résidus : chaque recette a démonté ses sujets (« aucun résidu », « Données DEMO
intactes »).

## V.5 Dettes

- Choix restrictifs Q-7 à Q-9, Q-11, Q-12, Q-14, Q-15 en vigueur jusqu'à décision contraire (§11).
- Pas d'avoirs : une vente facturée ne s'annule pas (B-10) — décision existante.
- Futur indicateur PDV : exclure les règlements adossés (DEC-055 §c).
- `analytics.sql` §10 suppose qu'aucune facture n'est datée du jour : vert aujourd'hui, fragile.

## V.6 Production

*(complétée après déploiement)*

---


# 0. 🟥 À lire d'abord — la branche n'a PAS pu être poussée

Chaque `git push -u origin claude/happy-lovelace-iniyzo` a été **refusé (403)** :

```
remote: Claude doesn't have GitHub access to moraproentrepreneur-hash/ADIKOM-PILOT for your organization.
fatal: unable to access 'https://github.com/moraproentrepreneur-hash/ADIKOM-PILOT/': The requested URL returned error: 403
```

La **lecture** fonctionne (le `fetch` de `lot-28-point-de-vente` a abouti) ; l'**écriture** n'est
pas accordée à l'application GitHub Claude pour cette organisation — comme au LOT 27.

**Transmission retenue** : un **bundle Git** et un **patch de secours**, produits **hors du dépôt**
(répertoire de travail temporaire de la session), **jamais commités** :

| Fichier | Contenu | Restauration |
| --- | --- | --- |
| `lot-28.bundle` | les commits `a0b907c..HEAD` de la branche | `git fetch lot-28.bundle claude/happy-lovelace-iniyzo:lot-28-point-de-vente-cloud` sur un dépôt portant `a0b907c` |
| `lot-28.patch` | `git format-patch a0b907c..HEAD` en un fichier | `git am lot-28.patch` sur `a0b907c` — **secours seulement** |

Le message de livraison donne le SHA final et le résultat de `git bundle verify`.

**Remède** (hors de portée du Cloud) : reconnecter GitHub sur `https://claude.ai/connect-github`,
ou faire installer l'application Claude sur le dépôt avec droit d'écriture ; puis relancer le push.

---

# 1. Ce qui a été livré

## 1.1 Préalable S-1 — en premières migrations, commits distincts

| Migration | Effet |
| --- | --- |
| **112** `20261009000100_une_facture_client_nait_par_sa_fonction` | garde `customer_invoices_zzz_born_by_function` (dernière) ; `create_customer_invoice` reprise de sa **dernière version** (098) + **deux** `set_config` |
| **113** `20261009000200_un_reglement_client_nait_par_sa_fonction` | garde `customer_payments_zzz_born_by_function` ; `record_customer_payment` reprise de sa dernière version (053) + deux `set_config`, drapeau refermé **avant** l'écriture de trésorerie |

Motif du Rapport 20, à l'identique : aucune table, colonne, policy ni capacité ; aucune
`SECURITY DEFINER`. Recettes : `customer_invoices.sql` **§17 bis**, `customer_payments.sql`
**§12 bis** (refus direct, anti-vacuité — la création normale consomme un numéro et produit son
écriture —, drapeau qui ne survit pas).

## 1.2 Fonctionnel

- **Vendre** des services `SALE`/`BOTH` actifs, variante active, **prix résolu par la base au jour
  comorien** (D16 ; la version de prix est tracée), sous la **session ouverte de l'utilisateur** —
  refus sans session, sur session close, ou sur la session d'un autre.
- **Paiements multiples** : espèces, chèque, Mvola, Holo, Wakati. **La base calcule l'encaissé** :
  hors espèces pour son montant, espèces pour le reste à payer ; **monnaie = donné − encaissé**,
  en espèces seulement ; **une écriture `POS_SALE` par paiement, de l'encaissé** (T-2).
- **D-3** : espèces → compte `CASH` de la caisse, **imposé** ; autres modes → compte **`BANK` actif**
  choisi. Mode et compte lisibles dans le journal, l'écriture (« Vente VTE-… — Mvola »), la fiche,
  le reçu, l'export (une ligne par paiement).
- **Remises** (D-1) fixes en KMF, ligne et globale, bornées en base, sous `pos.sales.discount`.
- **Vente non soldée** (P-4) : client exigé, `pos.sales.credit`, facture **émise dans la même
  transaction**, acompte en règlement adossé, reste dû suivi par la facture ; règlements suivants
  par `record_customer_payment`.
- **Facture sur demande** (C-2) : orchestrateur `invoice_pos_sale` des fonctions **existantes** ;
  lignes `SERVICE` + `DISCOUNT` libellées ; **règlement adossé par paiement, sans écriture**.
- **Annulation** (B-10) motivée, même session close ; **refusée si facturée** ; vente, paiements
  et **leurs** écritures `CANCELLED`, rien d'effacé. Aucun remboursement (B-11).
- `pos_session_expected` = **fond + espèces encaissées** des paiements validés.
- **D-2** : Mvola, Holo, Wakati aussi dans les règlements clients et fournisseurs.
- **Écrans** : `/pdv/caisse` (clavier : `Ctrl+K`, `↑↓`, `Entrée`, `F2`, `Échap`, annoncés ; total
  toujours visible ; sous 900 px panier dessous et barre collante ; état « aucune session ouverte »
  qui mène à l'ouverture), `/pdv/ventes` (filtres jour, session, statut, mode ; cartes sous
  1024 px), `/pdv/ventes/[id]` (montants **de la base**, paiements, écritures, facture, reçu,
  annulation) ; reçu **A4 sans coût ni marge** ; export « ventes ».

## 1.3 Documentation

- `00 Documentation/03_Modules/12_Point_de_Vente.md` — v0.2, **§12 à §22 écrits avant toute
  migration du lot** (commit `2774cbf`).
- `CLAUDE.md` §10 — règles du LOT 28.
- `01_Journal_des_Decisions.md` — DEC-055 « Mise en œuvre — provisoire ».

---

# 2. Commits (dans l'ordre)

| SHA | Objet |
| --- | --- |
| `f9535c6` | fix(billing) : S-1 — une facture client naît par sa fonction |
| `ac560a9` | fix(billing) : S-1 — un règlement client naît par sa fonction |
| `2774cbf` | docs(pos) : module 12 complété (ventes), CLAUDE.md §10 |
| `457db1b` | feat(pos) : migrations 114 à 120 |
| `5d25041` | test(pos) : recette SQL `pos_sales.sql` + script npm |
| `1eaf4e0` | fix(pos) : migration 119 repérable par le contrôle de parité (commentaire seul) |
| `e3a3b59` | feat(pos) : écrans, documents, export, navigation, Vitest |
| `4584b21` | test(pos) : recette navigateur écrite, responsive |
| *(suivant)* | docs : ce rapport, DEC-055 mise en œuvre |

---

# 3. Migrations — dans l'ordre d'application

| # | Fichier | Contenu |
| :-: | --- | --- |
| 112 | `20261009000100_une_facture_client_nait_par_sa_fonction` | S-1 factures |
| 113 | `20261009000200_un_reglement_client_nait_par_sa_fonction` | S-1 règlements |
| 114 | `20261009000300_modes_de_paiement_mvola_holo_wakati` | **isolée** : `payment_method` += MVOLA, HOLO, WAKATI |
| 115 | `20261009000400_ecriture_de_vente_au_comptoir` | **isolée** : `treasury_entry_kind` += POS_SALE |
| 116 | `20261009000500_ventes_et_paiements_du_point_de_vente` | enum `pos_sale_status` ; `pos_sales`, `pos_sale_lines`, `pos_payments`, `commercial_line_costs` ; `customer_invoices.pos_sale_id`, `customer_payments.pos_payment_id` ; gardes de cohérence, d'adossement, « nées par leur fonction » ; contrôle différé de la vente (P-4) ; journal ; RLS ; `audit_detail_permission` **reprise entière** de la 108 (+4) |
| 117 | `20261009000600_cinquieme_origine_de_tresorerie` | `treasury_entries.pos_payment_id` + index unique ; `single_origin` à 5 ; `fn_treasury_entry_source` (depuis **077**), `_immutable` (depuis **074**), `_consistent` (depuis **071**), policies insert (071) et update (**073**) — **révisées ensemble** |
| 118 | `20261009000700_encaisser_facturer_annuler_une_vente` | dérivés `pos_sale_*` ; `pos_session_expected` (depuis 109) ; `invoice_pos_sale`, `record_pos_sale`, `cancel_pos_sale` |
| 119 | `20261009000800_capacites_et_numerotation_des_ventes` | règle `pos_sale` (VTE, avec année) ; **8 capacités** ; assertion **246** |
| 120 | `20261009000900_perimetre_de_sauvegarde_des_ventes` | `backup_scope()` réécrite entière : **69**, ordre paire par paire |

Chaque migration se termine par ses **contrôles** (`raise exception` si un acquis disparaît).
**Aucune migration existante modifiée. Aucun fichier du LOT 27 modifié** (migrations 108–111,
`features/pos`, écrans) — exception signalée §9 pour deux **recettes**.

---

# 4. 🟥 C-2 — comment le double comptage est interdit, en base

| Garantie | Mécanisme | Éprouvée par |
| --- | --- | --- |
| Une écriture par paiement, de l'**encaissé** | `fn_treasury_entry_source` : `POS_SALE`, `IN`, `amount = applied_amount`, compte du paiement ; index unique `pos_payment_id` | `pos_sales.sql` §6 bis, §8 b-c |
| Un règlement adossé **n'a jamais d'écriture** | branche « règlement client » de `fn_treasury_entry_source` : refus si `pos_payment_id` | §7 bis, §8 a |
| **Paiement fictif** impossible | garde d'adossement : drapeau propre + paiement et vente `VALIDATED` + **même montant encaissé, compte, mode, jour** | §8 e-g |
| **Double rattachement** impossible | index uniques (une facture non annulée par vente ; un règlement par paiement) ; facture et paiement de la **même** vente | §7, §8 g |
| **Incohérences d'annulation** fermées | règlement adossé non annulable seul ; facture d'une vente non annulable (Q-11) ; vente facturée non annulable (B-10) ; écriture `POS_SALE` qui ne s'annule qu'avec son paiement (contrôle différé) ; annuler une vente n'annule que **ses** écritures | §9, §15, §15 bis |
| Tout naît par sa fonction | drapeaux `adikom.pos_sale`, `adikom.pos_invoice_link`, `adikom.pos_backed_payment` + S-1 ; gardes `zzz_` en dernier | §8 h, §15 |
| P-4 tenue en base | contrôle différé : non soldée ⇒ client **et** facture émise | §14, §14 bis |

---

# 5. Capacités — 238 → 246 (C-28)

`pos.sales.view` · `.create` · **`.discount`** (ADMIN ✓) · **`.credit`** (ADMIN ✓) · `.cancel` ✓ ·
`.download` ✓ · `.print` ✓ · `.export` ✓. Aucune 9ᵉ. Aucune affectation aux groupes système.

| Acte | Capacités exigées en base |
| --- | --- |
| Encaisser | `pos.sales.create` + `.view` + `pos.sessions.view` + `pos.registers.view` + `treasury.accounts.view` + `catalog.services.view` ; + `parties.clients.view` (client) ; + `pos.sales.discount` (remise) ; + `pos.sales.credit` et facturation (non soldée) |
| Facturer sur demande | `pos.sales.view` + `billing.customer_invoices.create/.view/.issue` + `billing.customer_payments.create/.view` + `parties.clients.view` + `catalog.services.view` |
| Annuler | `pos.sales.cancel` + `.view` + `treasury.entries.view` + `billing.customer_invoices.view` |

---

# 6. Tables ajoutées — `backup_scope` 65 → 69

`pos_sales`, `pos_sale_lines`, `pos_payments`, `commercial_line_costs` — placées après
`service_variant_costs` (donc après `pos_session_amounts`, `clients`, les variantes et leurs prix),
**avant** `customer_invoices`, `customer_payments`, `treasury_entries`, qui les citent.

🟥 **Les tables sauvegardées changent** : le cycle destructif SAUVEGARDE → RÉINITIALISATION →
RESTAURATION est **dû** en local (`CLAUDE.md` §47 bis).

---

# 7. Tests réalisés dans le Cloud

## 7.1 Chaîne du projet

| Contrôle | Résultat |
| --- | --- |
| `npm ci` | ✅ |
| `npm run lint` | ✅ 0 erreur |
| `npm run typecheck` | ✅ |
| `npm run test` | ✅ **454 / 454**, 21 fichiers (426 + **28** du lot) — dont la **parité TS ↔ SQL** du catalogue |
| `npm run build` | ✅ avec `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co` et `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder` en ligne de commande, jamais écrites |

## 7.2 🟩 Exécution réelle — base PostgreSQL 16 JETABLE (ce n'est PAS Supabase)

Base locale au conteneur, vide de toute donnée réelle, socle imitant Supabase (rôles `anon` /
`authenticated` / `service_role`, `auth.uid()` lisant `request.jwt.claims`, schéma `storage`), un
Super Admin **fictif** pour les recettes qui l'exigent.

| Contrôle | Résultat |
| --- | --- |
| Les **120** migrations depuis une base vide | ✅ toutes appliquées, contrôles intégrés compris |
| `pos_sales.sql` (25 sections) | ✅ **25 / 25** sous `set local role authenticated` (RLS réellement appliquée) |
| La même recette **validée par COMMIT** | ✅ — les contrôles différés acceptent les actes légitimes en conditions réelles |
| `backup.sql` **avec des ventes** (6 ventes, 3 factures adossées, 6 écritures POS, 1 coût copié) | ✅ 15 / 15 — export, réinitialisation, restauration **fidèles** |
| Non-régression (base au niveau 120, vide) | ✅ `treasury`, `transfers`, `customer_payments`, `customer_invoices`, `supplier_invoices`, `commerce`, `purchasing`, `catalog`, `backup`, `pos_sessions`, `rental_billing`, `analytics`, `dashboard`, `notifications`… — **25 vertes** |
| Rouges **préexistants** (identiques à 111 migrations, sans le lot) | `audit_journal`, `planning`, `projects`, `settings` — dus à la base jetable vide (constat du Rapport 21 §8.2) |

> Ces résultats **réduisent le risque** d'une erreur SQL à l'application ; ils ne remplacent pas
> la recette locale (PostgREST, GoTrue, privilèges effectifs, version de production).

## 7.3 Ce que couvre `pos_sales.sql`

1 capacités · 2 tables, RLS, gardes, aucun total stocké · 3–4 profils et décor · 5 vente sans
session / sur la session d'un autre · **6 test de référence 60 000 / 100 000 / 40 000 → trésorerie
60 000** · **7 facture sur demande PAYÉE, solde inchangé, une seule facture** · **8 écritures forgées
et règlements adossés directs ou fictifs refusés** · 9 annulations incohérentes fermées · 10 services
non vendables · 11 monnaie, modes, D-3, paiement mixte (T-2), contraintes de la monnaie en base ·
12–13 remises D-1 et lignes DISCOUNT · **14 P-4** · 15 B-10 · 16 théorique = fond + espèces,
annulation après clôture · 17–18 permissions, coût copié, Q-12 · 19 journal · 20 sauvegarde.

---

# 8. Ce qui n'a PAS pu être exécuté dans le Cloud

| Non exécuté | Raison | Qui |
| --- | --- | --- |
| **Push de la branche** | 🟥 GitHub 403 (§0) | à débloquer |
| `db:status`, `db:push`, `db:verify:*` sur Supabase | interdit au Cloud, aucun accès | Local |
| `verify:pos-sales` (écrite), `verify:responsive` | base et application réelles | Local |
| Écrans dans un navigateur | aucune pile Supabase : **aucun écran n'a été vu rendu** | Local |
| Cycle de sauvegarde destructif réel | base réelle | Local |
| Contrôle Vercel | jeton absent | Local |

---

# 9. Écarts au Plan, et fichiers hors lot touchés

| Écart | Pourquoi |
| --- | --- |
| `treasury_entries.pos_payment_id` au lieu de `pos_sale_id` (Plan 02 §9.2) | **T-2** validée |
| `customer_payments.pos_payment_id` au lieu de `pos_sale_id` | règlement adossé **par paiement** (C-2 validée) |
| `pos_payments` porte `status`, `session_id`, `cashier_id` | suivre l'annulation ; théorique de session ; policy Q-12 — clés composites, la copie ne ment pas |
| `commercial_line_costs` : une table, **une colonne de clé par document** (non polymorphe) | répond à la question « table unique ou par document » du Plan 02 §9.3 sans polymorphisme ; le LOT 28 ne pose que la ligne de vente |
| Section de navigation **« Ventes au comptoir »** distincte de « Point de vente » | `features/pos/pos.test.ts` (LOT 27, intouchable) fige la section à deux entrées. **À fusionner** en local après validation du LOT 27 (ajuster trois assertions de ce test) |
| Recettes **hors lot** ajustées | `commerce.sql` §4 et §19, `purchasing.sql` §(commercial_line_costs) : elles affirmaient l'**absence** du LOT 28 ou recevaient désormais le refus S-1 avant l'index — réécrites pour éprouver **plus** (S-1 **et** l'index ; table de coûts **gardée**). `pos_sessions.sql` (LOT 27) §1 : portée limitée aux menus caisses/sessions, les `pos.sales.*` existant désormais |
| `verify-commerce.mjs` | libellé d'un contrôle (« refusé par l'index ») corrigé : le refus vient désormais de S-1 |

---

# 10. Risques

| Risque | Niveau | Mesure |
| --- | :-: | --- |
| Branche non poussée | 🟥 | bundle + patch hors dépôt ; débloquer l'accès GitHub |
| Écarts PostgreSQL 16 jetable ↔ Supabase | 🟧 | `db:push` puis `db:verify:pos-sales` + non-régression en local |
| Écrans jamais rendus | 🟧 | `verify:pos-sales`, `verify:responsive`, revue 390 / 768 / 1440 |
| Clôture de session **concurrente** d'une vente : la vente peut entrer juste avant la clôture et manquer au compté | 🟩 | l'écart la montre (dérivé) ; `close_pos_session` (LOT 27) n'est pas modifiée |
| Fragilités **préexistantes** révélées par une base peuplée : `analytics.sql` §10 suppose qu'aucune facture n'est datée d'aujourd'hui ; `pos_sessions.sql` §17 qu'aucune session n'est ouverte dans toute la base | 🟧 | ni l'une ni l'autre ne vient du lot ; à corriger en local (filtrer sur les objets de la recette) — `pos_sessions.sql` relève du LOT 27 |
| Indicateurs « encaissé clients » | 🟩 | conséquence connue DEC-055 §c : comptent le règlement adossé, daté du jour de la vente |

---

# 11. Questions ouvertes — options les plus restrictives retenues

| Réf. | Question | Option retenue | Alternative |
| :-: | --- | --- | --- |
| **Q-7** | Type du compte hors espèces | **`BANK`** (texte de la proposition D-3 validée) | tout compte actif sauf la caisse de la session |
| **Q-8** | Plusieurs remises d'espèces dans une vente | **Une seule** | plusieurs, monnaie sur la dernière |
| **Q-9** | Qui calcule l'encaissé | **La base** | l'écran (refusé : la vérité serait côté client) |
| **Q-10** | Facturer une vente anonyme en lui ajoutant un client | **Non** | rattacher un client à la facturation (décision à prendre) |
| **Q-11** | Annuler la facture d'une vente | **Non**, tant que les avoirs n'existent pas | — |
| **Q-12** | Qui lit les paiements | `pos.sales.view` **ou** `pos.sessions.amounts.view` **ou** le caissier | `pos.sales.view` seul : le théorique serait faux pour le lecteur des montants |
| **Q-13** | Coût copié sans `catalog.services.cost.view` | **Aucun** (pas de `SECURITY DEFINER`) : marge « inconnue » | une garde `SECURITY DEFINER` dédiée (exception D4 à décider) |
| **Q-14** | Dates | facture : jour de la demande ; règlement adossé : jour de la vente | — |
| **Q-15** | Remise totale | **Autorisée** (net 0, sans paiement), non facturable | plafond — interdit d'invention par DEC-051 §e |
| **N-1** | Fusion de la navigation (§9) | section distincte provisoire | fusion en local |

Aucune ne bloque le lot. **Aucune modification structurante hors DEC-055 n'a été implémentée.**

---

# 12. Ce que la reprise locale doit lancer — liste exacte

Après fusion de `main` (LOT 27 validé) dans la branche, recalage éventuel des assertions **246**
(migration 119) et **69** (migration 120) si le LOT 27 a changé, relecture, contrôle des secrets,
`npm ci · lint · typecheck · test · build`, **sauvegarde préalable** :

1. `npm run db:status` → **exactement** les 9 migrations `20261009000100` à `20261009000900`.
2. `npm run db:push`.
3. **Recettes du lot** : `npm run db:verify:pos-sales`, `db:verify:customer-invoices`,
   `db:verify:customer-payments` (S-1).
4. **Non-régression étendue** (trésorerie, paiements, facturation commune, sauvegarde) :
   `db:verify:treasury`, `db:verify:transfers`, `db:verify:supplier-invoices` (enum),
   `db:verify:commerce`, `db:verify:purchasing`, `db:verify:catalog`, `db:verify:pos-sessions`,
   `db:verify:audit`, `db:verify:backup`, `db:verify:billing`, `db:verify:dashboard`,
   `db:verify:analytics` — puis `verify:customer-payments`, `verify:supplier-payments`,
   `verify:capabilities`, `verify:commerce`, `verify:backup`.
5. **Cycle destructif obligatoire** : SAUVEGARDE → RÉINITIALISATION → RESTAURATION.
6. Recettes navigateur : `verify:pos-sales -- <url>`, `verify:pos-sessions -- <url>`,
   `verify:responsive -- <url>`.
7. Fusion de la navigation (§9), puis `verify:production` après déploiement.

---

**LOT 28 — VALIDÉ.** (SHA déployé : V.6)
