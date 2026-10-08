# Prompt — LOT 28 · Point de vente · Claude Code Cloud

> **Organisation révisée le 8 octobre 2026** : Cloud LOT 27 → **Cloud LOT 28** → Local LOT 27 →
> Local LOT 28 → GitHub → Vercel. Le LOT 28 se développe **avant** la validation Supabase du
> LOT 27, sur le code **provisoire** de celui-ci.
>
> 🟩 **Décisions validées par la Direction le 8 octobre 2026 — DEC-055.**
> ✅ Branches `lot-27-caisses-sessions` et `lot-28-point-de-vente` publiées sur GitHub.
> Si ton push est refusé (403), **continue de développer** : voir « Push refusé » plus bas.

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

## Décisions rendues — 🟩 validées le 8 octobre 2026 (DEC-055)

- **C-2** — **un seul enregistrement effectif en trésorerie par encaissement.** La facture
  demandée après une vente encaissée est soldée par un **règlement adossé**, **sans** seconde
  écriture. Le mécanisme est protégé en base contre :
  - les **paiements fictifs** : un règlement adossé ne naît que par sa fonction, pour un paiement
    PDV réel, `VALIDATED`, d'une vente `VALIDATED`, du **même** montant, compte et mode ;
  - les **doubles rattachements** : un paiement PDV n'a qu'**une** écriture et qu'**un** règlement
    adossé non annulé ; une vente n'a qu'**une** facture non annulée ; facture et paiement
    appartiennent à la **même** vente ; aucune écriture `CUSTOMER_PAYMENT` sur un règlement adossé ;
  - les **incohérences d'annulation** : un règlement adossé ne s'annule pas seul
    (`cancel_customer_payment` refuse) ; une vente facturée ne s'annule pas (B-10) ; annuler une
    vente annule ses écritures, jamais celles d'une autre.

  **Toute modification structurante non couverte par ces décisions** (nouvelle table hors liste,
  réécriture d'une fonction de facturation ou de trésorerie au-delà de la 5ᵉ origine, nouveau type
  de compte, nouvelle capacité) : **arrête-toi** et soumets-la au rapport, sans l'implémenter.
- **T-2** — **une écriture de trésorerie par paiement réel** (`treasury_entries.pos_payment_id`),
  jamais une écriture globale par vente ; un paiement mixte est réparti entre les comptes concernés.
- **D-3** — espèces → le compte `CASH` **actif** de la caisse (imposé en base) ; chèque, Mvola,
  Holo, Wakati → un compte financier **actif sélectionné**. Le **mode de paiement** et
  l'**identité du compte** restent visibles dans le journal d'audit, les écritures, la fiche de
  vente, le reçu et les exports.
- **P-4** — une vente **non soldée** exige un **client enregistré**.
- **D-1** — remises **fixes en KMF** selon DEC-051 (ligne et globale, sans plafond, sous
  `pos.sales.discount`), gardes DEC-051 §d en base : aucun montant négatif. Sur la facture, chaque
  remise devient une ligne `DISCOUNT` libellée.
- **D-2** — `MVOLA`, `HOLO`, `WAKATI` aussi dans les **règlements clients et fournisseurs** existants.
- **B-10** — annulation **motivée** possible après la clôture de la session ; **interdite si la
  vente est facturée**, tant que les avoirs ne sont pas gérés.
- **B-11** — remboursement au comptoir **hors périmètre**.
- **C-28** — les **8 capacités** du Plan 02 §10.2 : catalogue **prévisionnel 238 → 246**.
- **S-1** — garde « née par sa fonction » sur `customer_invoices` et `customer_payments`,
  **en amont** de leur intégration au PDV : **premières migrations** de ta branche, commits distincts.

## À lire d'abord

`CLAUDE.md` · `RAPPORTS/Preparation LOT 27-28/00_Preparation_Cloud_Local_LOT_27_28.md` (§0, §4,
§6, §7) · **`06_Decisions_LOT_28_Propositions.md`** · **DEC-055** (journal des décisions) · Rapport 21 **provisoire** · module
`12_Point_de_Vente.md` · Plan 02 §3.4, §3.5, §7.5, §9.1–9.5, §10.2, §12, §13, §16.2, §18.2
(LOT 28) · Plan 01 §16.2–16.8, §16.14–16.15, §21 · DEC-051 · migrations de trésorerie
(`20260906000100`, **dernière version de `fn_treasury_entry_source` : `20260908000200`**) et de
règlements clients (`20260902000100`, `20260902000200`) · `AGENTS.md`.

## Horodatage des migrations — bloc réservé

- `20261008000500` à `20261008009900` : **réservé aux corrections locales du LOT 27**. N'y écris rien.
- Le LOT 28 commence à **`20261009000100`**, dans l'ordre : S-1 → extensions d'enum
  (chacune **seule** dans sa migration) → tables → 5ᵉ origine → fonctions → capacités et
  numérotation → `backup_scope`.

## Développement

1. **S-1** : garde « née par sa fonction » sur `customer_invoices` et
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

**Push refusé (403).** Ne t'arrête pas de développer. Conserve tes commits, retente le push à
chaque étape, et à la fin produis un **bundle Git** **hors du dépôt** :
`git bundle create lot-28.bundle origin/lot-28-point-de-vente..HEAD`,
puis `git bundle verify`. Nomme au rapport la branche, le sha final et la base requise. Ne commite
jamais le bundle.

## Livraison

`npm ci` · `lint` · `typecheck` · `test` · `build` verts. Rapport provisoire
`RAPPORTS/Rapport 22_LOT_28_Point_de_Vente_PROVISOIRE.md` : branche réelle, sha, base (`09d9ab6`
+ docs), écarts au Plan, questions ouvertes avec l'option la plus restrictive retenue, et la
**non-régression étendue** due en local (trésorerie, paiements, facturation, sauvegarde).
**DEC-055** : **complète** l'entrée existante (décisions déjà
validées) d'une section « Mise en œuvre — provisoire », sans modifier ses §a à §c. Push de la branche, puis arrêt.

Termine par : **« LOT 28 CLOUD — BRANCHE `<nom>` POUSSÉE À `<sha>`, SUR LE LOT 27 PROVISOIRE. EN ATTENTE DE VALIDATION LOCALE DU LOT 27 PUIS DU LOT 28. »**
