# Prompt — LOT 28 · Point de vente · Claude Code Cloud

> ⛔ **Ne pas lancer** tant que : le LOT 27 n'est pas **fusionné dans `main` et déployé**
> (Rapport 21 définitif présent) ; **P-4**, **D-1**, **D-2**, **B-10**, **C-28** ne sont pas rendus ;
> la décision **S-1** (correctif préalable) n'est pas prise. Compléter le bloc ci-dessous.

---

Tu développes le **LOT 28 — Point de vente : ventes et encaissement** d'ADIKOM PILOT, dans un
environnement Cloud **sans accès à Supabase**. C'est le **seul lot qui touche à la trésorerie** :
la rigueur financière prime sur tout le reste (`CLAUDE.md` §57–58).

**Ton rôle — développement uniquement** (méthode **Cloud → GitHub → Local → Supabase → GitHub →
Vercel**) : tu développes, écris migrations, recettes et tests, exécutes ce qui se peut sans
Supabase, pousses **ta branche**, rédiges un rapport provisoire, et **t'arrêtes**. **Jamais** de
fusion ou de push sur `main`, d'application de migration, d'accès aux données de production, ni
de déploiement Vercel volontaire.

## Décisions rendues (à compléter)

- P-4 — vente non soldée sans client identifié : `[REFUSÉE / ACCEPTÉE]`
- D-1 — remise PDV selon DEC-051 (montant fixe KMF, ligne / globale) : `[…]`
- D-2 — Mvola, Holo, Wakati aussi pour les règlements clients et fournisseurs : `[OUI / NON]`
- B-10 — annulation d'une vente d'une session close : `[…]` · B-11 — remboursement : `[…]`
- C-28 — capacités : `[les 8 du Plan 02 §10.2 / liste amendée]`
- S-1 — correctif « née par sa fonction » de `customer_invoices` / `customer_payments` : `[FAIT AU sha … / NON]`

## Pré-vérification

Vérifie que `main` contient le LOT 27 validé (Rapport 21 définitif, tables `pos_registers` /
`pos_sessions` présentes dans les migrations). Sinon, **arrête-toi**.

## À lire d'abord

`CLAUDE.md` · `00_Preparation_Cloud_Local_LOT_27_28.md` §4, §6, §7 · Rapport 21 · Plan 02 §3.4,
§3.5, §7.5, §9.1–9.5, §10.2, §12, §13, §16.2, §18.2 (LOT 28) · Plan 01 §16.2–16.8, §16.14–16.15,
§21 (programme de tests de la Direction) · DEC-051 · migrations de trésorerie
(`20260906000100_…`) et de règlements clients (`20260902000100_…`) · `AGENTS.md`.

## Étape 1 — analyse, puis ARRÊT

Résous la **contradiction C-2** (préparation §4.4) : pour chaque cas — vente soldée, vente
soldée puis facture sur demande, vente non soldée avec client, annulation — indique
**l'unique** origine de trésorerie de chaque franc encaissé, les colonnes de liaison retenues
(**l'une des deux, jamais les deux**, Plan 02 §3.5), et comment `fn_treasury_entry_source`
refuse le double comptage. Écris-la dans `RAPPORTS/LOT_28_Analyse_C2_PROVISOIRE.md`, pousse la
branche, et **arrête-toi** : le schéma ne s'écrit qu'après validation.

## Étape 2 — après validation de l'analyse

- Doc module 12 complétée (ventes) **avant** le code.
- Migrations isolées : `payment_method` += `MVOLA`, `HOLO`, `WAKATI` ; `treasury_entry_kind` +=
  `POS_SALE`.
- `pos_sale_status`, `pos_sales`, `pos_sale_lines`, `pos_payments` (`applied ≤ tendered`,
  monnaie en espèces seulement), `commercial_line_costs`, colonnes de liaison retenues ; vente
  **exige une session ouverte** ; services vendables seulement ; prix résolu à la date (D16).
- 5ᵉ origine de trésorerie : contrainte d'origine unique, `fn_treasury_entry_source`,
  `_immutable`, `_consistent` et policy d'insert **révisées ensemble**, chacune reprise depuis
  **sa dernière version**.
- Fonctions : `record_pos_sale`, `cancel_pos_sale`, facture sur demande (orchestrateur des
  fonctions de facturation **existantes**, jamais réécrites) ; garde « née par sa fonction » sur
  chaque table `pos_*` ; `pos_session_expected` étendu aux espèces encaissées.
- Capacités (**238 → 246** si C-28 inchangée), numérotation VTE, `backup_scope` + assertion.
- Écran caisse clavier, historique, fiche, reçu A4 **sans coût ni marge**, exports.
- Tests Vitest ; recettes **écrites** `supabase/tests/pos_sales.sql` couvrant **tout** le Plan 02
  §18.2 LOT 28 et Plan 01 §21 : 60 000 / 100 000 / 40 000 → trésorerie **60 000** ; écriture
  forgée refusée ; vente sans session refusée ; facture sur demande → solde **inchangé** ;
  remise ; vente non soldée selon P-4 ; annulation ; permissions positives et négatives ;
  anti-vacuité.

**Règles** : aucune `SECURITY DEFINER` ; `require_capability` en tête ; `revoke/grant`
explicites ; `has_permission` en sous-select ; aucune migration ancienne ni aucun code de
capacité existant modifié ; aucun secret, aucune `.env*`, aucune donnée réelle (dépôt **public**) ;
**aucun `vercel.json` ni `vercel.ts`** (il réactiverait un déploiement Preview) ; commandes `npm`
dans `01_Developpement/adikom-pilot/` ; **ni** `db:push`, **ni** `db:verify:*`, **ni** `verify:*`,
**ni** `demo:*`, **ni** `backup:*` ; aucune correction hors périmètre ; commits réguliers poussés
sur la branche.

## Livraison

Branche **`lot-28-point-de-vente`** depuis `main`. `npm ci` · `lint` · `typecheck` · `test` ·
`build` verts. Rapport provisoire `RAPPORTS/Rapport 22_LOT_28_Point_de_Vente_PROVISOIRE.md`,
qui liste la **non-régression étendue** due en local (trésorerie, paiements, facturation,
sauvegarde). Brouillon **DEC-055** marqué provisoire. Push de la branche, puis arrêt.

Termine par : **« LOT 28 CLOUD — BRANCHE `<nom>` POUSSÉE À `<sha>`. EN ATTENTE DE VALIDATION LOCALE. »**
