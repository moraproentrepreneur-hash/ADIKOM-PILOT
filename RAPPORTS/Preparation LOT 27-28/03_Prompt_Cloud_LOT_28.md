# Prompt — LOT 28 · Point de vente · Claude Code Cloud

> **Organisation révisée le 8 octobre 2026** : Cloud LOT 27 → **Cloud LOT 28** → Local LOT 27 →
> Local LOT 28 → GitHub → Vercel. Le LOT 28 se développe **avant** la validation Supabase du
> LOT 27, sur le code **provisoire** de celui-ci.
>
> ⛔ **Ne pas lancer** tant que :
> 1. la branche `lot-28-point-de-vente` n'est **pas publiée** sur GitHub, et l'application Claude
>    n'a pas l'**accès en écriture** au dépôt (le LOT 27 a échoué en 403) ;
> 2. **C-2 et T-2** ne sont pas validées, ainsi que **D-3, P-4, D-1** (voir
>    `06_Decisions_LOT_28_Propositions.md`) ;
> 3. le bloc « Décisions rendues » ci-dessous n'est pas complété.

---

Tu développes le **LOT 28 — Point de vente : ventes et encaissement** d'ADIKOM PILOT, dans un
environnement Cloud **sans accès à Supabase** et **sans aucun secret de production**. C'est le
**seul lot qui touche à la trésorerie** : la rigueur financière prime sur tout le reste
(`CLAUDE.md` §57–58).

**Ton rôle — développement uniquement.** Tu développes, écris migrations, recettes et tests,
exécutes ce qui se peut sans Supabase, pousses **ta branche**, rédiges un rapport provisoire, et
**t'arrêtes**. **Jamais** : fusion ou push sur `main`, fusion de la branche LOT 27, application
d'une migration, accès à une donnée de production, déploiement Vercel volontaire.

## Point de départ — un code provisoire

- Ta base est la branche **`lot-28-point-de-vente`**, qui contient le **LOT 27 provisoire**
  (`09d9ab6` : 111 migrations, 238 capacités, 65 tables sauvegardées) **plus** les documents de
  préparation actualisés. **Rien du LOT 27 n'a encore tourné sur Supabase.**
- Les compteurs 238 et 65 sont **provisoires**. Tes assertions de total les supposent ; si la
  validation locale du LOT 27 les change, le local recalera tes migrations.
- **Ne modifie aucun fichier du LOT 27** (migrations `20261008000100` à `0400`, `features/pos`,
  écrans `/pdv/caisses` et `/pdv/sessions`). Si tu y trouves un défaut, **note-le** au rapport ;
  la correction appartient à la validation locale du LOT 27. Seule exception : étendre
  `pos_session_expected` par une **nouvelle** migration (`create or replace` depuis sa dernière
  version), jamais en réécrivant la 109.
- Si la plateforme impose un préfixe (`claude/…`), crée ta branche **depuis**
  `lot-28-point-de-vente` et nomme la branche réelle au rapport.

## Décisions rendues (à compléter avant lancement)

- **C-2** — origine unique d'un encaissement PDV : `[option A — règlement adossé / autre]`
- **T-2** — 5ᵉ origine : `[treasury_entries.pos_payment_id / pos_sale_id]`
- **D-3** — compte des paiements non-espèces : `[compte BANK actif choisi / autre]`
- **P-4** — vente non soldée sans client : `[REFUSÉE / ACCEPTÉE]`
- **D-1** — remise PDV selon DEC-051, reportée en lignes `DISCOUNT` sur la facture : `[…]`
- **D-2** — Mvola, Holo, Wakati aussi pour les règlements clients et fournisseurs : `[OUI / NON]`
- **B-10** — annulation d'une vente d'une session close : `[…]` · vente facturée : `[refusée / …]`
- **B-11** — remboursement : `[hors périmètre / …]`
- **C-28** — capacités : `[les 8 du Plan 02 §10.2 → 246 / liste amendée]`
- **S-1** — garde « née par sa fonction » sur `customer_invoices` / `customer_payments` :
  `[OUI, en tête de branche / NON]`

Si un seul de C-2, T-2, D-3, P-4, D-1 est vide : **arrête-toi** et dis-le.

## À lire d'abord

`CLAUDE.md` · `RAPPORTS/Preparation LOT 27-28/00_Preparation_Cloud_Local_LOT_27_28.md` (§0, §4,
§6, §7) · **`06_Decisions_LOT_28_Propositions.md`** · Rapport 21 **provisoire** · module
`12_Point_de_Vente.md` · Plan 02 §3.4, §3.5, §7.5, §9.1–9.5, §10.2, §12, §13, §16.2, §18.2
(LOT 28) · Plan 01 §16.2–16.8, §16.14–16.15, §21 · DEC-051 · migrations de trésorerie
(`20260906000100`, **dernière version de `fn_treasury_entry_source` : `20260908000200`**) et de
règlements clients (`20260902000100`, `20260902000200`) · `AGENTS.md`.

## Horodatage des migrations — bloc réservé

- `20261008000500` à `20261008009900` : **réservé aux corrections locales du LOT 27**. N'y écris rien.
- Le LOT 28 commence à **`20261009000100`**, dans l'ordre : S-1 (si retenue) → extensions d'enum
  (chacune **seule** dans sa migration) → tables → 5ᵉ origine → fonctions → capacités et
  numérotation → `backup_scope`.

## Développement

1. **S-1** (si retenue) : garde « née par sa fonction » sur `customer_invoices` et
   `customer_payments` (motif du Rapport 20 : drapeau transactionnel + déclencheur `zzz_` en
   dernier), commits **distincts**, recettes négatives d'`INSERT` direct.
2. **Doc module 12** complétée (ventes) **avant** le code.
3. Migrations isolées : `payment_method` += `MVOLA`, `HOLO`, `WAKATI` ; `treasury_entry_kind` +=
   `POS_SALE`.
4. `pos_sale_status`, `pos_sales`, `pos_sale_lines`, `pos_payments` (`applied ≤ tendered`,
   `method = 'CASH' or applied = tendered`, compte selon D-3), `commercial_line_costs` ; vente
   **exige une session ouverte** de l'acteur ; services `SALE`/`BOTH` actifs seulement ; prix
   résolu à la date (D16) ; aucun total stocké.
5. **C-2 exactement comme validée** : `treasury_entries.pos_payment_id` (5ᵉ origine),
   `customer_invoices.pos_sale_id`, `customer_payments.pos_payment_id` (règlement adossé **sans**
   écriture). Contrainte d'origine à **5**, `fn_treasury_entry_source`, `_immutable`,
   `_consistent` et policy d'insert **révisées ensemble**, chacune reprise **depuis sa dernière
   version**. Refus d'une écriture `CUSTOMER_PAYMENT` sur un règlement adossé.
6. Fonctions : `record_pos_sale`, `cancel_pos_sale`, facture sur demande (orchestrateur des
   fonctions de facturation **existantes**, jamais réécrites) ; garde « née par sa fonction » sur
   chaque table `pos_*` et sur le règlement adossé ; `pos_session_expected` étendu aux **seules
   espèces** encaissées.
7. Capacités (**238 → 246** si C-28 inchangée), numérotation VTE, `backup_scope` **65 → 69** +
   assertion.
8. Écran caisse clavier (`Ctrl+K`, `↑↓`, `Entrée`, `F2`, `Échap`, annoncés), historique, fiche,
   reçu **A4 sans coût ni marge**, exports ; responsive 390 / 768 / 1440.
9. Tests Vitest ; recette **écrite** `supabase/tests/pos_sales.sql` couvrant le Plan 02 §18.2
   LOT 28 et le Plan 01 §21 : 60 000 / 100 000 / 40 000 → trésorerie **60 000** ; facture sur
   demande → facture **PAYÉE** et solde **inchangé** ; écriture forgée refusée ; règlement adossé
   inséré directement refusé ; vente sans session refusée ; remise ; vente non soldée selon P-4 ;
   annulation selon B-10 ; permissions positives et négatives ; anti-vacuité.

Si PostgreSQL est disponible dans le conteneur, tu peux, comme au LOT 27, monter une base
**jetable, vide, sans aucune donnée réelle** pour appliquer les migrations et faire tourner tes
recettes. Le rapport dit alors clairement : **ce n'est pas Supabase**.

## Règles

Aucune `SECURITY DEFINER` ; `require_capability` en tête ; `revoke/grant` explicites ;
`has_permission` en sous-select ; aucune migration ancienne ni aucun code de capacité existant
modifié ; aucun secret, aucune `.env*`, aucune donnée réelle (dépôt **public**) ; **aucun
`vercel.json` ni `vercel.ts`** ; aucun `.bundle` ni `.patch` commité ; commandes `npm` dans
`01_Developpement/adikom-pilot/` ; `next build` seulement avec des variables publiques **factices**
(`https://example.supabase.co`, `placeholder`) ; **ni** `db:push`, **ni** `db:verify:*`, **ni**
`verify:*`, **ni** `demo:*`, **ni** `backup:*` ; aucune correction hors périmètre ; commits
réguliers poussés sur ta branche.

Si le push échoue (403) : ne t'arrête pas de développer ; à la fin, produis un **bundle Git**
(`git bundle create … <base>..HEAD`) vérifié, **hors du dépôt**, et dis-le au rapport.

## Livraison

`npm ci` · `lint` · `typecheck` · `test` · `build` verts. Rapport provisoire
`RAPPORTS/Rapport 22_LOT_28_Point_de_Vente_PROVISOIRE.md` : branche réelle, sha, base (`09d9ab6`
+ docs), écarts au Plan, questions ouvertes avec l'option la plus restrictive retenue, et la
**non-régression étendue** due en local (trésorerie, paiements, facturation, sauvegarde). Brouillon
**DEC-055** marqué provisoire. Push de la branche, puis arrêt.

Termine par : **« LOT 28 CLOUD — BRANCHE `<nom>` POUSSÉE À `<sha>`, SUR LE LOT 27 PROVISOIRE. EN ATTENTE DE VALIDATION LOCALE DU LOT 27 PUIS DU LOT 28. »**
