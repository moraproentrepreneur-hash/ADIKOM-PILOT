# ADIKOM PILOT

## Module 12 — Point de vente

**Version :** 0.1 — *provisoire, à valider en local*
**Statut :** Document de référence fonctionnelle — partie **Caisses et sessions de caisse** (LOT 27)
**Entreprise :** ADIKOM Technology & Travel
**Projet :** ADIKOM PILOT
**Code module :** `pos` · ordre **12**
**Périmètre :** LOT 27 — **Caisses** et **sessions de caisse**. Les **ventes au comptoir**, les
encaissements, les reçus et la règle de la monnaie relèvent du **LOT 28** et ne sont **pas**
décrits ici (§12).
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

# 12. Ce que le LOT 28 ajoutera — pour mémoire, non décrit ici

Ventes de services sous **session ouverte**, paiements multiples (Espèces, Chèque, Mvola, Holo,
Wakati), règle de la monnaie (**la trésorerie enregistre l'encaissé, jamais le donné**), remise,
vente non soldée, reçu A4, facture sur demande, annulation. Le montant théorique de clôture
s'enrichira des encaissements en espèces. Les questions **P-4, D-1, D-2, B-10, B-11, C-2, C-28**
restent à trancher **avant** ce lot.
