# ADIKOM PILOT

## Module 12 — Point de vente

**Version :** 0.2 — *provisoire, à valider en local* (0.1 : LOT 27 · 0.2 : LOT 28, §12 à §22)
**Statut :** Document de référence fonctionnelle — **Caisses et sessions de caisse** (LOT 27) et
**Ventes et encaissement** (LOT 28)
**Entreprise :** ADIKOM Technology & Travel
**Projet :** ADIKOM PILOT
**Code module :** `pos` · ordre **12**
**Périmètre :** LOT 27 — **Caisses** et **sessions de caisse** (§1 à §11). LOT 28 — **ventes au
comptoir**, encaissements, règle de la monnaie, remises, vente non soldée, reçu, facture sur
demande, annulation (§12 à §22), selon **DEC-055** (décisions de la Direction du 8 octobre 2026).
**Sources :** `RAPPORTS/Plan 02` §7.5, §8, §9.1, §9.4, §9.5, §10.2, §10.3, §11.4, §12, §13.2,
§18.2 · `RAPPORTS/Plan 01` §16.1, §16.9–16.14 · `RAPPORTS/Preparation LOT 27-28/00_…` §3 ·
décisions Direction **B-8, B-9, B-13, C-27, T-1** (8 octobre 2026) · DEC-017, DEC-024, DEC-038,
DEC-042 §d · Rapport 20 §3 (« née par sa fonction »)

> **Pourquoi ce document existe avant le code.** Le Plan 02 §16.3 et `CLAUDE.md` §2 exigent que
> la documentation fonctionnelle d'un module précède son premier `create table`. Il n'existait
> aucun document « Point de vente » dans `03_Modules/` : la spécification était dispersée entre
> les Plans 01 et 02. Ce document la rassemble pour la partie livrée par le LOT 27, **sans rien
> y ajouter qui n'ait été décidé** — les choix techniques retenus en l'absence de décision sont
> signalés comme tels (§11).

---

# 1. Objet du module

Le **Point de vente** permettra à ADIKOM d'encaisser au comptoir des **services** du catalogue
(LOT 20), sous la responsabilité nominative d'un **caissier**.

Le LOT 27 en pose les **fondations** : **qui** tient **quelle caisse**, de **quand** à **quand**,
avec **quel fond de caisse**, et **quel montant compté** à la fermeture.

```
COMPTE FINANCIER « Caisse »  (Banques & Caisses, LOT 6)
        │  une caisse s'y adosse — elle n'en crée pas un second
        ▼
     CAISSE  CAI-000001
        │  une seule session ouverte à la fois
        ▼
     SESSION  SES-2026-000001   caissier · ouverture · clôture
        │
        ├── montants (table sœur) : fond de caisse · montant compté
        └── écart = compté − théorique   ← DÉRIVÉ, jamais stocké (D1)

     VENTES AU COMPTOIR  ← LOT 28 (une vente exigera une session ouverte)
```

## 1.1 Ce que le LOT 27 livre

- Déclarer, modifier, désactiver et réactiver une **caisse**, adossée **obligatoirement** à un
  compte financier de type **Caisse** et **actif**.
- **Ouvrir** une session : la caisse, le caissier (c'est l'utilisateur qui ouvre), le fond de
  caisse déclaré.
- **Clôturer** une session avec un **montant compté obligatoire**. L'écart est **affiché, journalisé,
  jamais bloquant**. Une session close **ne se rouvre pas**.
- **Une seule session ouverte par caisse**, **une seule session ouverte par utilisateur** — garanties
  **en base**.
- Répondre à « **qui était en caisse le J entre 10h00 et 11h30 ?** ».
- **Consulter une session n'ouvre pas ses montants.** Un caissier voit **les siens**, jamais ceux
  d'un autre sans `pos.sessions.amounts.view`.
- **Exporter** la liste des sessions.

## 1.2 Ce que le LOT 27 ne livre pas

| Non livré | Pourquoi |
| --- | --- |
| Ventes, panier, paiements, monnaie, reçus, facture sur demande | LOT 28 |
| Modes de paiement Mvola, Holo, Wakati | LOT 28 (migration isolée, décision D-2 attendue) |
| Écriture de trésorerie, ajustement d'écart | **B-9** : aucune écriture d'ajustement — et aucune vente n'existe encore |
| Seuil d'écart toléré | **B-9** : aucun seuil |
| Document imprimable de session (rapport Z, ticket) | Aucun document n'est prévu au Plan 02 : aucune capacité `download` / `print` |
| Entrée de menu « Ventes — à venir » | DEC-042 §d : aucune entrée inerte |

---

# 2. 🟥 Une caisse n'est pas un compte : elle en utilise un

**Une seule trésorerie** (Plan 02 §20.1, garantie n° 5). Tout ce qu'une caisse encaissera
atterrira dans un compte que le module **Banques & Caisses** connaît déjà, et
`financial_account_balance()` restera **l'unique vérité du solde**.

| | Compte financier `CASH` | Caisse PDV |
| --- | --- | --- |
| Module | Banques & Caisses (06) | Point de vente (12) |
| Porte un solde | **Oui** — calculé des écritures | **Non** — jamais |
| Porte des écritures | Oui | Non (le LOT 28 en produira **dans le compte**) |
| Identifiant | `COMP-000001` | `CAI-000001` |

Plusieurs caisses **peuvent** s'adosser au même compte : aucune règle ne l'interdit, et le
système n'en invente pas (DEC-008).

## 2.1 Ce que la base garantit

| Garantie | Mécanisme |
| --- | --- |
| Le compte est de type **Caisse** — et le reste | Clé étrangère composite `(account_id, account_kind)` vers `financial_accounts (id, kind)`, avec `account_kind = 'CASH'`. Évaluée par le propriétaire de la table : **aucune lecture à travers RLS**. Changer en « compte bancaire » le type d'un compte qui adosse une caisse est **refusé par la base** |
| Le compte est **actif** à la déclaration, au changement de compte, à la réactivation et à l'ouverture d'une session | Déclencheur de garde + contrôle dans chaque fonction. La garde lit le compte **sous les droits de l'appelant** et **refuse** si elle ne le voit pas (elle ne conclut jamais « actif » faute de lecture) |
| Une caisse **naît et se modifie par ses fonctions** | Drapeau transactionnel + déclencheur `zzz_` en dernier (motif du Rapport 20 §3) |

---

# 3. La caisse

## 3.1 Identité

| Champ | Règle |
| --- | --- |
| Numéro | `CAI-000001` — règle `pos_register` de `numbering_rules`, **sans année** : une caisse est un équipement durable, non un acte daté |
| Libellé | Obligatoire — « Comptoir Moroni » |
| Compte adossé | Obligatoire — compte **Caisse actif** |
| Lieu | Facultatif |
| Active | Oui / non. Une caisse **inactive** n'accepte aucune nouvelle session ; son historique reste consultable |

## 3.2 Actes

| Acte | Fonction | Capacités exigées | Refus |
| --- | --- | --- | --- |
| Déclarer | `create_pos_register` | `pos.registers.create` + `pos.registers.view` + `treasury.accounts.view` | compte introuvable, non `CASH`, non actif |
| Modifier | `update_pos_register` | `pos.registers.update` + `pos.registers.view` ; **en plus**, pour changer de compte : `treasury.accounts.view` + `pos.sessions.view` | changement de compte **pendant une session ouverte** |
| Désactiver | `set_pos_register_active(…, false, motif)` | `pos.registers.archive` + `pos.registers.view` + `pos.sessions.view` | **session ouverte** sur la caisse |
| Réactiver | `set_pos_register_active(…, true, motif)` | `pos.registers.archive` + `pos.registers.view` + `treasury.accounts.view` | compte adossé devenu inactif |

**Aucune suppression** : une caisse citée par une session porte un historique (`CLAUDE.md` §22).

---

# 4. La session de caisse

## 4.1 Identité

| Champ | Règle |
| --- | --- |
| Numéro | `SES-2026-000001` — règle `pos_session`, **avec année**, remise à zéro annuelle |
| Caisse | Obligatoire |
| Caissier | **L'utilisateur qui ouvre.** Nul n'ouvre une session au nom d'un autre |
| Ouverture | Horodatée par la base (`now()`), jamais saisie |
| Clôture | Horodatée par la base, avec son auteur |
| Statut | `OPEN` (Ouverte) · `CLOSED` (Close) — **état terminal** |
| Observation de clôture | Facultative |

## 4.2 Cycle de vie

```
  ┌──────────┐   clôturer (montant compté OBLIGATOIRE)   ┌──────────┐
  │ OUVERTE  │ ─────────────────────────────────────────▶ │  CLOSE   │  ← terminal
  └──────────┘                                           └──────────┘
        ▲                                                  aucune réouverture
   ouvrir (fond de caisse)
```

## 4.3 🟥 Unicités — garanties en base (B-8)

| Règle | Index |
| --- | --- |
| **Une seule session ouverte par caisse** | `unique (register_id) where status = 'OPEN'` |
| **Une seule session ouverte par utilisateur**, même s'il existe plusieurs caisses | `unique (cashier_id) where status = 'OPEN'` |

L'écran **et** la fonction le disent avant d'écrire ; l'index fait autorité, y compris pour deux
clics simultanés.

## 4.4 Actes

| Acte | Fonction | Capacités exigées | Contrôles |
| --- | --- | --- | --- |
| Ouvrir | `open_pos_session(caisse, fond)` | `pos.sessions.open` + `pos.sessions.view` + `pos.registers.view` + `treasury.accounts.view` | fond ≥ 0 ; caisse active ; compte `CASH` actif ; aucune session ouverte sur la caisse **ni** pour l'utilisateur ; acteur authentifié |
| Clôturer | `close_pos_session(session, compté, note)` | `pos.sessions.close` + `pos.sessions.view` ; **en plus** `pos.sessions.amounts.view` pour clôturer la session **d'un autre** | session ouverte ; montant compté **obligatoire**, ≥ 0 |

**Une session naît et se clôt par ses fonctions** : un `INSERT` ou un `PATCH` direct est refusé
par la base (drapeau transactionnel, déclencheur `zzz_` en dernier). Sans cela, un appel direct
contournerait le numéroteur, la caisse active, le compte `CASH` et l'unicité par utilisateur.

---

# 5. 🟥 Les montants — une table sœur (T-1)

## 5.1 Pourquoi une table séparée

`pos.sessions.view` doit montrer **qui** était en caisse **sans** montrer **combien** il y avait
dedans (Plan 02 §10.2, §11.4). Or **RLS filtre des lignes, jamais des colonnes** (DEC-044,
précédent `maintenance_costs`). Des montants posés sur `pos_sessions` seraient lus par quiconque
lit la session.

**Décision T-1 (8 octobre 2026)** : les montants vivent dans `pos_session_amounts`, table **sœur
1:1** de la session.

| `pos_sessions` — lecture `pos.sessions.view` | `pos_session_amounts` — lecture **par ligne** |
| --- | --- |
| numéro, caisse, caissier, ouverture, clôture, statut, observation | fond de caisse, montant compté |

## 5.2 🟥 La lecture dépend de **qui est sur la ligne** (B-13)

```
lecture des montants  =  pos.sessions.amounts.view
                      OU  cashier_id = utilisateur courant
```

C'est le **premier objet du SaaS** dont la lecture dépend de la personne inscrite sur la ligne.
`cashier_id` est **recopié** sur la table sœur et **garanti identique** à celui de la session par
une clé étrangère composite `(session_id, cashier_id)` : la policy n'a pas à relire la session à
travers RLS.

| Profil | Voit la session | Voit **ses** montants | Voit les montants **d'un autre** |
| --- | :-: | :-: | :-: |
| `pos.sessions.view` seul (ex. planning) | ✅ | — (n'a pas de session) | ❌ |
| Caissier : `view` + `open` + `close` | ✅ | ✅ | ❌ |
| Responsable : `view` + `amounts.view` | ✅ | ✅ | ✅ |

## 5.3 Montant théorique et écart — **dérivés, jamais stockés** (D1)

```
Montant théorique  =  fond de caisse  (+ encaissements en ESPÈCES — LOT 28)
Écart              =  montant compté − montant théorique
```

Au LOT 27, **aucune vente n'existe** : le théorique **vaut le fond de caisse**. Le LOT 28
étendra `pos_session_expected` aux encaissements en espèces.

Un écart stocké **mentirait** dès qu'une vente serait annulée après la clôture : il est calculé
par `pos_session_expected` et `pos_session_variance`, sous les droits de l'appelant. Sans droit
de lecture des montants, ces fonctions rendent **NULL** — et l'écran dit « non visible », jamais
« 0 » (DEC-017).

## 5.4 L'écart ne bloque rien, ne mouvemente rien (B-9)

- **Aucun seuil** d'écart toléré.
- **Aucune écriture d'ajustement** : la clôture ne touche pas la trésorerie.
- La clôture **constate** l'écart, l'**affiche** et l'**audite** — l'événement de clôture du journal
  porte le théorique et l'écart **tels qu'ils étaient au moment de la clôture**.

---

# 6. « Qui était en caisse le J entre 10h00 et 11h30 ? »

La session est un **objet daté** : la question se résout par un recouvrement d'intervalles.

```
période d'une session = [ouverture, clôture)      — clôture absente = +∞
fenêtre demandée      = [10h00, 11h30)
réponse               = sessions dont la période RECOUVRE la fenêtre
```

- Index **GiST** sur `tstzrange(opened_at, coalesce(closed_at, 'infinity'), '[)')` : la réponse
  est instantanée, quel que soit l'historique.
- Fonction `pos_sessions_in_window(début, fin, caisse?, caissier?)`, gardée par
  `pos.sessions.view`. Elle ne rend **aucun montant**.
- Bornes : une session close **à 10h00 précises** n'était plus en caisse à 10h00 ; une session
  ouverte **à 11h30 précises** ne l'était pas encore. Les heures s'expriment dans le **fuseau
  comorien** (`Indian/Comoro`).

---

# 7. Capacités — 9 (C-27)

Module `pos`, **ordre 12**, libellé « Point de vente ». Catalogue **229 → 238**.

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `pos.registers.view` | VIEW | | Consulter les caisses |
| `pos.registers.create` | CREATE | | Déclarer une caisse |
| `pos.registers.update` | UPDATE | | Modifier une caisse |
| `pos.registers.archive` | ARCHIVE | | Désactiver / réactiver une caisse |
| `pos.sessions.view` | VIEW | | Consulter les sessions — **sans leurs montants** |
| `pos.sessions.amounts.view` | VIEW | ✓ | Voir les montants **de toutes** les sessions |
| `pos.sessions.open` | CREATE | | Ouvrir une session |
| `pos.sessions.close` | VALIDATE | | Clôturer une session |
| `pos.sessions.export` | EXPORT | ✓ | Exporter la liste des sessions |

**Non créées** (Plan 02 §10.3) : `pos.sessions.variance.view` (l'écart est la soustraction de
deux montants qu'`amounts.view` ouvre déjà), `pos.sessions.download` / `.print` (aucun
document), toute capacité `pos.sales.*` (LOT 28).

**Groupes système (B-12)** : aucune affectation automatique — attribution manuelle, comme aux
LOT 25 et 26.

---

# 8. Écrans

| Écran | Contenu | Capacité |
| --- | --- | --- |
| `/pdv/caisses` | Liste des caisses, compte adossé, session en cours | `pos.registers.view` |
| `/pdv/caisses/nouvelle` | Déclaration d'une caisse | `pos.registers.create` |
| `/pdv/caisses/[id]` | Fiche, modification, activation, dernières sessions | `pos.registers.view` |
| `/pdv/sessions` | Liste filtrable : jour et plage horaire, caisse, caissier, statut ; ouverture d'une session | `pos.sessions.view` |
| `/pdv/sessions/[id]` | Fiche ; montants **gardés** ; clôture | `pos.sessions.view` (+ montants selon §5.2) |

- **Bandeau « session ouverte »** réutilisable : il rappelle à l'utilisateur sa session en cours
  (caisse, ouverture, lien de clôture). Le LOT 28 l'affichera en tête de l'écran de caisse.
- **Sept états** (`CLAUDE.md` §38) : normal, chargement, succès, erreur, vide, désactivé,
  permission insuffisante — dont l'état **« montants non visibles »**, qui le dit au lieu
  d'afficher 0.
- **Responsive** 390 / 768 / 1440 : les tableaux deviennent des cartes sous 1024 px.
- **Aucune entrée « Ventes — à venir »** (DEC-042 §d).

---

# 9. Audit

| Acte | Objet | Type | Avant / après |
| --- | --- | --- | --- |
| Déclarer, modifier, (dés)activer une caisse | `pos_registers` | `CREATE` / `UPDATE` | ✅ |
| Ouvrir une session | `pos_sessions` | `CREATE` | caisse, caissier, ouverture — **sans montant** |
| — son fond de caisse | `pos_session_amounts` | `CREATE` | fond de caisse |
| Clôturer une session | `pos_sessions` | **`VALIDATE`** | statut, clôture, auteur — **sans montant** |
| — son montant compté | `pos_session_amounts` | **`VALIDATE`** | compté, **théorique et écart constatés** |

**Le journal n'ouvre pas ce que la table ferme** (DEC-038) : le détail d'un événement
`pos_session_amounts` n'est lisible qu'avec `pos.sessions.amounts.view` ; celui d'une session avec
`pos.sessions.view` ; celui d'une caisse avec `pos.registers.view`.

---

# 10. Sauvegarde

`backup_scope()` : **62 → 65** tables, des parents vers les enfants :

```
financial_accounts ─▶ pos_registers ─▶ pos_sessions ─▶ pos_session_amounts
```

Les trois tables sont placées **après `financial_accounts`** et **avant le cycle d'exploitation**.
La restauration lève les gardes de cycle de vie (`is_restoring()`), jamais les gardes de
cohérence. Une session dont le caissier n'existe plus est écartée **avec ses montants** : les deux
tables citent directement `app_users`.

---

# 11. Choix techniques retenus en l'absence de décision — à confirmer

Conformément à la consigne « toute question non tranchée : l'option la plus restrictive, nommée
comme telle », les points suivants sont **des choix techniques**, non des règles métier :

| Réf. | Question | Option retenue (la plus restrictive sans impasse) |
| --- | --- | --- |
| **Q-1** | Ouvrir une session exige-t-il de lire le compte adossé ? | **Oui** : `treasury.accounts.view` est exigée, parce que la garde « compte actif » doit lire la vérité sans fonction `SECURITY DEFINER`. Le LOT 28 l'exigera de toute façon pour écrire dans ce compte |
| **Q-2** | Qui peut clôturer la session d'un autre caissier ? | Un porteur de `pos.sessions.close` **et** de `pos.sessions.amounts.view`. Réserver la clôture au seul caissier enfermerait la caisse si celui-ci est absent (« une impasse n'est pas une garantie », DEC-027 §e) |
| **Q-3** | Changer le compte d'une caisse ou la désactiver avec une session ouverte ? | **Refusé** |
| **Q-4** | L'observation de clôture se modifie-t-elle après coup ? | **Non** : une session close est entièrement figée |
| **Q-5** | L'export porte-t-il les montants ? | **Seulement** pour un porteur de `pos.sessions.amounts.view` ; sinon les colonnes de montants sont **absentes** du fichier |

---

# 12. LOT 28 — Ventes et encaissement : objet

Le LOT 28 permet de **vendre au comptoir des services du catalogue** (LOT 20) et d'**encaisser**
la vente, sous une **session de caisse ouverte** (LOT 27), avec la garantie centrale de
DEC-055 :

> **Un encaissement, une seule écriture de trésorerie.** Tout franc reçu au comptoir a
> exactement UNE origine de trésorerie : le **paiement PDV**. Une facture rattachée à une vente
> ne produit **jamais** d'écriture pour cet argent (C-2).

```
SESSION OUVERTE (de l'utilisateur)                     LOT 27
   │
   ▼
VENTE  VTE-2026-000001 ── lignes (services SALE/BOTH actifs, prix daté D16)
   │                    ── remises fixes en KMF (D-1) : de ligne, globale
   │                    ── client : facultatif (A-12), OBLIGATOIRE si non soldée (P-4)
   │
   ├── PAIEMENTS (1..n)  mode · donné · encaissé · compte (D-3)
   │       │
   │       └── 1 ÉCRITURE `POS_SALE` PAR PAIEMENT (T-2) — montant = ENCAISSÉ, jamais donné
   │
   ├── REÇU A4 immédiat — sans coût ni marge
   │
   └── FACTURE (sur demande, ou d'office si non soldée)
           │  chaîne de facturation EXISTANTE (create · lignes · émission)
           └── RÈGLEMENT ADOSSÉ par paiement PDV — SANS écriture (C-2)
```

## 12.1 Ce que le LOT 28 livre

- Vente de services, sous **la session ouverte de l'utilisateur** — refus sinon.
- Plusieurs paiements par vente, modes **Espèces, Chèque, Mvola, Holo, Wakati** (A-9).
- **Règle de la monnaie** : net 60 000, donné 100 000 → encaissé **60 000**, monnaie **40 000**,
  trésorerie **60 000**.
- **Remises** fixes en KMF, de ligne et globale, sous `pos.sales.discount` (D-1, DEC-051).
- **Vente non soldée** sous `pos.sales.credit`, **client enregistré exigé** (P-4) : une facture
  client naît **dans la même transaction**, et le solde vit dans la facture.
- **Reçu A4** (téléchargement, impression), **sans coût ni marge**.
- **Facture sur demande** d'une vente soldée : **règlement adossé**, aucune seconde écriture.
- **Annulation motivée** (B-10), y compris après la clôture de la session ; **refusée si la vente
  est facturée**.
- Historique des ventes, fiche, export.
- `pos_session_expected` compte désormais **fond de caisse + espèces encaissées**.
- **D-2** : `MVOLA`, `HOLO`, `WAKATI` disponibles aussi dans les règlements clients et
  fournisseurs.

## 12.2 Ce que le LOT 28 ne livre pas

| Non livré | Pourquoi |
| --- | --- |
| Remboursement au comptoir | **B-11** — hors périmètre : une vente erronée s'annule, elle ne se rembourse pas |
| Avoir, annulation d'une vente facturée | **B-10** — tant que les avoirs ne sont pas gérés |
| Création d'un client depuis la caisse | P-4 : la fiche client complète (tarifs préférentiels, `CLAUDE.md` §13) relève de Tiers |
| Nouveau type de compte (`MOBILE`) | D-3 : aucun nouveau type ; un compte par opérateur, déclaré dans Banques & Caisses |
| Indicateur PDV au tableau de bord | Aucun n'est prévu ; DEC-055 §c : tout futur indicateur devra exclure les règlements adossés |
| Ticket 80 mm | Plan 02 §7.5 : reçu **A4** |

---

# 13. 🟥 Un encaissement, une seule écriture (C-2, T-2)

## 13.1 Les quatre cas — où va chaque franc

| Cas | Trésorerie | Facture | Règlement client |
| --- | --- | --- | --- |
| **1. Vente soldée** — net 60 000, donné 100 000 espèces | **1 écriture `POS_SALE` de 60 000** sur le compte de la caisse ; monnaie 40 000 : aucune écriture | aucune | aucun |
| **2. Vente soldée, puis facture sur demande** | **rien de nouveau** — le solde reste **60 000** | créée par la chaîne existante, `pos_sale_id` posé, **émise** | **un règlement adossé par paiement PDV**, sans écriture → facture **PAYÉE** |
| **3. Vente non soldée avec client** — net 100 000, versé 30 000 | **1 écriture `POS_SALE` de 30 000** | créée **et émise dans la même transaction**, 100 000 | règlement adossé 30 000 → reste dû **70 000** ; les règlements suivants passent par `record_customer_payment` (écriture `CUSTOMER_PAYMENT`, normale) |
| **4. Annulation d'une vente non facturée** | les écritures `POS_SALE` passent `CANCELLED` | — | — |

## 13.2 Les trois liens — et aucun autre

| Colonne | Rôle | Garantie en base |
| --- | --- | --- |
| `treasury_entries.pos_payment_id` | **5ᵉ origine** — la seule écriture de cet argent (T-2 : une écriture **par paiement**, jamais par vente) | `kind = POS_SALE`, `direction = IN`, `amount = applied_amount`, compte du paiement, paiement et vente `VALIDATED` à la création ; **une seule écriture par paiement** (index unique) |
| `customer_invoices.pos_sale_id` | **lien documentaire** : quelle vente la facture reprend | posé **uniquement** par la fonction de facturation PDV ; **une seule facture non annulée par vente** ; client de la facture = client de la vente ; ni location ni commande |
| `customer_payments.pos_payment_id` | **règlement adossé** : solde la facture **sans** écriture | né **uniquement** par sa fonction ; paiement PDV et vente `VALIDATED` ; **même montant, compte et mode** ; facture et paiement de la **même** vente ; **un seul règlement adossé non annulé par paiement** |
| ~~`pos_sales.customer_invoice_id`~~ | **non créée** (DEC-055 §b) | — |

## 13.3 Ce qui interdit le double comptage — en base, jamais à l'écran

1. `treasury_entries_single_origin` porte **cinq** origines ; une écriture n'en a qu'une.
2. `fn_treasury_entry_source` **refuse toute écriture** dont le règlement client porte un
   `pos_payment_id` : **un règlement adossé n'a jamais d'écriture**.
3. Index unique `treasury_entries (pos_payment_id)` : **une seule écriture par paiement**.
4. Un paiement PDV `VALIDATED` porte **exactement une** écriture `POS_SALE` validée, un paiement
   annulé **aucune** — contrôle différé, vérifié à la fin de la transaction.
5. Le règlement adossé, le paiement, la vente, la ligne et le lien facture → vente **naissent par
   leurs fonctions** (drapeau transactionnel + déclencheur `zzz_` en dernier, Rapport 20).
6. `fn_treasury_entry_source`, `_immutable`, `_consistent` et les policies d'insertion et de
   modification des écritures sont **révisées ensemble**, chacune reprise de **sa dernière
   version**.

## 13.4 Les incohérences d'annulation fermées

| Tentative | Réponse |
| --- | --- |
| Annuler seul un règlement adossé (`cancel_customer_payment`) | **Refusé** : il n'a pas d'écriture, et rouvrirait une dette payée au comptoir |
| Annuler une vente **facturée** | **Refusé** (B-10), tant que les avoirs ne sont pas gérés |
| Annuler la facture d'une vente | **Refusé** — choix restrictif §21 Q-11 : la facture a été remise au client, sans avoir |
| Annuler une vente | annule **ses** paiements et **ses** écritures, jamais ceux d'une autre |

---

# 14. La vente

## 14.1 Identité

| Champ | Règle |
| --- | --- |
| Numéro | `VTE-2026-000001` — règle `pos_sale`, avec année, remise à zéro annuelle |
| Session | **Obligatoire, ouverte, et celle de l'utilisateur** — nul ne vend sur la session d'un autre |
| Caissier | Recopié de la session, garanti identique par une clé composite |
| Date et heure | Horodatées par la base ; le **jour** est le jour comorien (`Indian/Comoro`) |
| Client | Facultatif (A-12) ; **obligatoire si la vente n'est pas soldée** (P-4) |
| Remise globale | Montant fixe en KMF, ≥ 0 (D-1) |
| Observation | Facultative (Plan 01 §16.2) |
| Statut | `VALIDATED` · `CANCELLED` (terminal) |
| Annulation | date, auteur, **motif obligatoire** |

**Aucun total n'est stocké** (D1) : brut, remises, net, encaissé, donné, monnaie et reste dû sont
**calculés** (`pos_sale_total`, `pos_sale_paid`…).

## 14.2 Les lignes

| Champ | Règle |
| --- | --- |
| Service, variante | Service **`SALE` ou `BOTH`**, **actif** ; variante **active** ; la variante appartient au service (clé composite) |
| Prix unitaire | **Résolu par la base** à la date de la vente (D16) ; la version de prix est tracée. **Jamais saisi** |
| Quantité | Entier > 0 |
| Remise de ligne | Fixe en KMF, `0 ≤ remise ≤ quantité × prix` (DEC-051 §d) |
| Libellé | Recopié du catalogue (« Service — Variante ») |

## 14.3 Les calculs — DEC-051 §c

```
brut de ligne       = quantité × prix unitaire
net de ligne        = brut de ligne − remise de ligne        (jamais négatif)
sous-total          = Σ nets de ligne
NET À PAYER         = sous-total − remise globale            (jamais négatif)
```

---

# 15. 🟥 Les paiements et la règle de la monnaie

## 15.1 Le paiement

| Champ | Règle |
| --- | --- |
| Mode | `CASH`, `CHEQUE`, `MVOLA`, `HOLO`, `WAKATI` au comptoir |
| Montant **donné** | Entier > 0 |
| Montant **encaissé** | Entier > 0, **≤ donné** ; **calculé par la base** |
| Monnaie | `donné − encaissé` — **seulement en espèces** (`method = 'CASH' or encaissé = donné`) |
| Compte | **D-3**, ci-dessous |
| Référence | Facultative — n° de chèque, référence Mvola |

## 15.2 La règle, transcrite sans interprétation

```
Net à payer       =  pos_sale_total(vente)
Montant donné     =  Σ donné
Montant encaissé  =  Σ encaissé
Monnaie à rendre  =  donné − encaissé              (espèces seulement)

L'ÉCRITURE DE TRÉSORERIE PORTE L'ENCAISSÉ. JAMAIS LE DONNÉ.
```

**Calcul par la base.** L'écran envoie, pour chaque paiement, le mode, le montant donné et (hors
espèces) le compte. La base calcule l'encaissé : les paiements hors espèces s'imputent pour leur
montant (aucune monnaie), les espèces pour **le reste à payer**, et la monnaie est la différence.

| Situation | Effet |
| --- | --- |
| Donné = net | Encaissé = net, monnaie 0 |
| Donné > net, en espèces | Encaissé = net, monnaie = donné − net, **écriture = net** |
| Hors espèces au-delà du net | **Refusé** : pas de monnaie sur un chèque ou un transfert mobile |
| Donné < net | **Refusé**, sauf vente non soldée (§17) |

## 15.3 🟥 D-3 — sur quel compte entre l'argent

| Mode | Compte mouvementé | Garantie |
| --- | --- | --- |
| `CASH` | **le compte `CASH` de la caisse** de la session — **imposé** | vérifié par la base à la création ; la caisse ne change pas de compte pendant une session ouverte (LOT 27, Q-3) |
| `CHEQUE`, `MVOLA`, `HOLO`, `WAKATI` | un compte **actif** sélectionné, de type **`BANK`** (« Mvola ADIKOM », déclaré dans Banques & Caisses) | vérifié par la base ; un compte `CASH` est refusé, sans quoi l'écart de caisse mentirait |

Le **mode** et l'**identité du compte** restent visibles dans le journal d'audit, l'écriture
(libellé « Vente VTE-… — Mvola »), la fiche de vente, le reçu et l'export.

## 15.4 Le montant théorique de la session

```
Théorique  =  fond de caisse  +  Σ encaissé EN ESPÈCES des paiements validés de la session
```

Seules les **espèces** entrent dans la caisse physique. Une vente annulée — même après la clôture
(B-10) — sort du théorique : l'écart d'une session close **change**, il est dérivé, jamais stocké.

**Lecture** : qui lit les montants d'une session (`pos.sessions.amounts.view`, ou le caissier
lui-même — B-13) lit aussi les paiements qui les composent. Sans quoi le théorique serait faux pour
lui, en silence (§21 Q-12).

---

# 16. 🟥 Remises (D-1)

DEC-051 s'applique **sans adaptation** : montant fixe en KMF, de ligne et globale, toutes deux
facultatives, **aucun plafond**, aucun pourcentage.

- Gardes **en base** : remise de ligne `0 ≤ r ≤ brut de ligne` ; remise globale `0 ≤ R ≤
  sous-total` ; net et total **jamais négatifs**.
- Toute remise non nulle exige **`pos.sales.discount`**, vérifiée **dans la fonction**.
- La remise réduit le net : la vente reste **soldée** (Plan 02 §3.4).
- Sur la facture, chaque remise devient une **ligne `DISCOUNT` libellée** (« Remise sur
  <service> », « Remise globale »). Le total net est identique ; aucune fonction de facturation
  n'est modifiée.

---

# 17. 🟥 Vente non soldée (P-4)

- Exige **`pos.sales.credit`** et un **client enregistré** — une vente anonyme se règle
  intégralement, et l'écran **dit pourquoi**.
- La facture client naît **dans la même transaction** que la vente, par la chaîne existante, et
  est **émise**. Chaque paiement reçu au comptoir devient un **règlement adossé** : le reste dû
  est celui de la facture, suivi par le module Facturation (relances, échéance, « en retard »).
- Les règlements ultérieurs passent par **`record_customer_payment`** — écriture
  `CUSTOMER_PAYMENT`, normale : cet argent-là n'est pas entré au comptoir lors de la vente.
- La vente non soldée **appelle les fonctions de facturation**, qui exigent leurs propres
  capacités (`billing.customer_invoices.create`, `.view`, `.issue`, `billing.customer_payments.
  create`, `.view`, `parties.clients.view`) : **rien n'est contourné** (DEC-024).

---

# 18. 🟥 Facture sur demande (A-11, C-2)

`invoice_pos_sale(vente, échéance)` — un **orchestrateur** des fonctions **existantes** :

```
create_customer_invoice(client de la vente)        ← existante (S-1)
  └─ lien pos_sale_id                               ← posé par la fonction PDV seule
add_customer_invoice_line(SERVICE) par ligne       ← existante
add_customer_invoice_line(DISCOUNT) par remise     ← existante
issue_customer_invoice                             ← existante
règlement adossé par paiement PDV validé           ← SANS écriture de trésorerie
```

- Vente `VALIDATED`, **avec client** (une vente anonyme ne se facture pas — §21 Q-10), **non
  encore facturée**, de net > 0 (une créance de zéro n'est pas une créance).
- Facture **datée du jour de la demande** ; règlements adossés **datés du jour de la vente**.
- **Aucune 9ᵉ capacité** : la facture sur demande réemploie `billing.customer_invoices.create` /
  `.issue` et `billing.customer_payments.create` (C-28).

---

# 19. Annulation (B-10, B-11)

`cancel_pos_sale(vente, motif)` :

- exige `pos.sales.cancel` + `pos.sales.view` + `treasury.entries.view` (on ne défait pas une
  écriture qu'on ne lit pas) + `billing.customer_invoices.view` (on ne conclut pas « non
  facturée » sans pouvoir lire les factures) ;
- **motif obligatoire**, journalisé ;
- **refusée si la vente porte une facture non annulée** (B-10) — la garde est **en base** ;
- possible **après la clôture de la session** : l'écran avertit que l'écart de cette session
  change ;
- la vente, ses paiements et **leurs** écritures passent `CANCELLED` ; **rien n'est effacé**.

**B-11** : aucun remboursement. Si de l'argent est rendu physiquement, il sort de la caisse sans
écriture, et l'écart du jour le montre.

---

# 20. Capacités — 8 (C-28)

Catalogue **prévisionnel 238 → 246** (238 suppose le LOT 27 validé en local).

| Code | Action | Sensible | Libellé |
| --- | --- | :-: | --- |
| `pos.sales.view` | VIEW | | Consulter les ventes |
| `pos.sales.create` | CREATE | | Encaisser une vente |
| `pos.sales.discount` | ADMIN | ✓ | Accorder une remise |
| `pos.sales.credit` | ADMIN | ✓ | Valider une vente non soldée |
| `pos.sales.cancel` | CANCEL | ✓ | Annuler une vente |
| `pos.sales.download` | DOWNLOAD | ✓ | Télécharger un reçu |
| `pos.sales.print` | PRINT | ✓ | Imprimer un reçu |
| `pos.sales.export` | EXPORT | ✓ | Exporter les ventes |

**Capacités exigées par les actes composés** (« une garde qui compte doit compter la vérité ») :

| Acte | Capacités |
| --- | --- |
| Encaisser | `pos.sales.create` + `pos.sales.view` + `pos.sessions.view` + `pos.registers.view` + `treasury.accounts.view` + `catalog.services.view` ; + `parties.clients.view` si un client est nommé ; + `pos.sales.discount` si une remise ; + `pos.sales.credit` et les capacités de facturation si non soldée |
| Facturer sur demande | `pos.sales.view` + `billing.customer_invoices.create` / `.view` / `.issue` + `billing.customer_payments.create` / `.view` + `parties.clients.view` + `catalog.services.view` |
| Annuler | `pos.sales.cancel` + `pos.sales.view` + `treasury.entries.view` + `billing.customer_invoices.view` |
| Coût copié (`commercial_line_costs`) | lu par `catalog.services.cost.view` **seulement** (DEC-049 §e) |

**Groupes système** : aucune affectation automatique (B-12 reconduite).

---

# 21. Choix techniques retenus en l'absence de décision — 🟧 à confirmer

| Réf. | Question | Option retenue (la plus restrictive sans impasse) |
| :-: | --- | --- |
| **Q-7** | Type du compte d'un paiement hors espèces | **`BANK`** — texte de la proposition D-3 validée ; DEC-055 §a dit « compte financier actif sélectionné ». Un compte `CASH` fausserait l'écart de caisse |
| **Q-8** | Plusieurs paiements en espèces dans une même vente ? | **Un seul** : la monnaie se calcule sur une seule remise d'espèces |
| **Q-9** | Qui calcule le montant encaissé ? | **La base** : l'écran ne fournit que le donné |
| **Q-10** | Facturer une vente anonyme en y ajoutant un client après coup ? | **Non** : la vente est figée ; une vente anonyme ne se facture pas |
| **Q-11** | Annuler la facture d'une vente ? | **Non**, tant que les avoirs ne sont pas gérés — symétrique de B-10 |
| **Q-12** | Qui lit les paiements d'une vente ? | `pos.sales.view`, **ou** `pos.sessions.amounts.view`, **ou** le caissier de la ligne — afin que quiconque lit les montants d'une session en lise le théorique exact |
| **Q-13** | Coût copié si le vendeur n'a pas `catalog.services.cost.view` | **Aucun coût copié** (sans `SECURITY DEFINER`, on ne copie pas ce qu'on ne peut pas lire) : la marge de la ligne est « inconnue », et l'écran le dit |
| **Q-14** | Dates de la facture sur demande | Facture : jour de la demande. Règlements adossés : **jour de la vente** (DEC-055 §c) |
| **Q-15** | Une vente de net 0 (remise totale) | **Autorisée** (DEC-051 : total ≥ 0), sans paiement ; elle ne se facture pas |

---

# 22. Écrans, audit, sauvegarde

## 22.1 Écrans

| Écran | Contenu | Capacité |
| --- | --- | --- |
| `/pdv/caisse` | Caisse : bandeau de session, recherche (`Ctrl+K`, `↑↓`, `Entrée`), panier, remises, client, paiements, monnaie à la frappe, validation (`F2`), `Échap` | `pos.sales.create` |
| `/pdv/ventes` | Historique filtrable (jour, session, statut, mode), export | `pos.sales.view` |
| `/pdv/ventes/[id]` | Fiche : lignes, remises, paiements (mode, compte, donné, encaissé, monnaie), écritures, facture, reçu, facture sur demande, annulation | `pos.sales.view` |
| `/pdv/ventes/[id]/recu` | Reçu A4 (PDF) — **sans coût ni marge** | `pos.sales.download` / `.print` |

- **Le total est toujours visible**. Sous **900 px**, le panier passe **sous** la saisie et le
  total devient une **barre collante** (`CLAUDE.md` §35).
- **États** : normal, chargement, succès, erreur, vide (panier, catalogue), désactivé, permission
  insuffisante, **et « aucune session ouverte »**, qui propose d'en ouvrir une.

## 22.2 Audit

| Acte | Objet | Type |
| --- | --- | --- |
| Vente | `pos_sales` | `CREATE` (remise globale, client, session) |
| Lignes, paiements | `pos_sale_lines`, `pos_payments` | `CREATE` (mode, compte, donné, encaissé) |
| Annulation | `pos_sales`, `pos_payments` | `CANCEL` (motif) |
| Facture sur demande | `customer_invoices` | `CREATE` puis `VALIDATE` (chaîne existante) |
| Règlement adossé | `customer_payments` | `CREATE` |
| Coût copié | `commercial_line_costs` | `CREATE` — détail lisible par `catalog.services.cost.view` seule |

## 22.3 Sauvegarde

`backup_scope()` **65 → 69** : `pos_sales`, `pos_sale_lines`, `pos_payments` **après**
`pos_session_amounts`, `service_variants` et `clients` ; `commercial_line_costs` **après**
`pos_sale_lines` ; et `treasury_entries`, `customer_invoices`, `customer_payments` **après**
`pos_payments`, qu'ils citent. Le cycle destructif est **dû** en local (`CLAUDE.md` §47 bis).
