# Rapport 08 — Virement interne et Paiements divers

**LOT 17** · Achèvement des Modules 06 et 07
**Module 06 — Banques & Caisses** §28 à §33 · **Module 07 — Facturation & Paiement** §43 à §47
**Date :** 6 septembre 2026
**Décision associée :** DEC-040
**Commits :** `02a656a` — *l'argent qui change de place, et celui qui sort sans facture*
`15ef337` — *on n'annule pas l'écriture d'une opération qui n'est pas la sienne*
`9c76bf8` — *un motif ne se réécrit pas après coup*
**Production :** https://adikom-pilot.vercel.app — `READY` sur `9c76bf8`

---

## 1. Objectif du lot

Livrer les **deux dernières entrées annoncées « À venir »** dans la barre
latérale — les seules qui restaient marquées `planned` :

```
Banques & Caisses                 Facturation & Paiement
│                                 │
├── Comptes         LOT 6         ├── Factures clients        LOT 7
├── Écritures       LOT 6         ├── Factures fournisseurs   LOT 5
└── Virement interne  ← LOT 17    ├── Imputations             LOT 4
                                  └── Paiements divers  ← LOT 17
```

Après ce lot, **plus aucune entrée de navigation n'est « À venir »**.

Critères d'acceptation du `Module 06` §56 désormais couverts : **9, 10, 11, 12,
15** — les cinq qui restaient ouverts. Critère 15 du `Module 07` §63 (« les
paiements divers peuvent être enregistrés ») également.

---

## 2. Analyse préalable

### 2.1 Ce qui existait déjà — et qu'il ne fallait pas refaire

Le LOT 6 avait posé le socle financier ; le LOT 8 l'avait complété. Presque tout
ce dont ce lot avait besoin était **déjà en place**.

| Élément | Origine | Réutilisé tel quel |
| --- | --- | --- |
| `financial_accounts` — comptes, statuts, devise, solde initial figé | migration 049 | ✔ |
| `treasury_entries` — écriture, sens, genre, origine, immuabilité | migration 049 | ✔ étendue de deux origines |
| `financial_account_balance()` — solde calculé, jamais stocké | migrations 049, 050 | ✔ |
| `treasury_entry_kind` : `TRANSFER`, `MISC_PAYMENT` | migration 049 | ✔ **déjà présents** |
| Règle de numérotation `transfer` → `VIR` | migration 005 | ✔ **jamais consommée jusqu'ici** |
| Série `payment` → `REG`, générique | migration 005 | ✔ partagée (DEC-031) |
| `treasury.transfers.create` · `.validate` · `.cancel` | migration 007 | ✔ |
| `billing.misc_payments.view` · `.create` · `.validate` · `.cancel` | migration 007 | ✔ |
| `require_capability`, `has_permission`, `current_actor` | migrations 027, 038 | ✔ |
| `fn_audit_row`, `fn_forbid_delete`, `fn_set_updated_at` | migrations 004, 044 | ✔ |
| `audit_detail_permission()` — cartographie DEC-038 | migration 065 | ✔ étendue de deux objets |
| Composants `Field`, `Select`, `Notice`, `Card`, `Badge`, `EmptyState` | LOTs antérieurs | ✔ |

**Une seule chose manquait vraiment au catalogue** — voir §3.2.

### 2.2 Documents consultés

`README.md` · `CLAUDE.md` (§11, §16, §19, §19 bis, §22, §29, §31, §37, §38, §43,
§44, §46, §53, §57, §58, §59)
`00 Documentation/03_Modules/06_Banques_et_Caisses.md` — **intégral**, §28 à §33
en particulier
`00 Documentation/03_Modules/07_Facturation_et_Paiement.md` — §43 à §47, §52
`00 Documentation/04_Workflows/08_Paiement.md` · `00 Documentation/05_Regles_Metier/03_Finance.md`
`00 Documentation/08_Decisions/01_Journal_des_Decisions.md` — DEC-005, DEC-008,
DEC-010, DEC-017, DEC-022, DEC-024, DEC-026 §f, **DEC-029** (intégrale),
DEC-031, DEC-038
`RAPPORTS/Rapport 06_...md` · `RAPPORTS/Rapport 07_...md`
Migrations 005, 007, 044, 049, 050, 053, 054, 065.

---

## 3. Arbitrages

### 3.1 Le seul point réellement bloquant — tranché avant le code

`Module 06` ne dit **nulle part** si un virement se saisit puis se valide, ou
s'il naît validé comme un règlement. Deux architectures cohérentes en
découlaient, et elles n'ont pas les mêmes conséquences.

**Arbitrage ADIKOM du 5 septembre 2026 — Brouillon → Validé → Annulé**, avec
création de `treasury.transfers.view`.

Le motif est le catalogue lui-même, en application de la doctrine posée par
DEC-029 §c :

| Objet | Capacités au catalogue | Conséquence |
| --- | --- | --- |
| `billing.supplier_payments` | view · create · cancel | **un** geste |
| `billing.customer_payments` | view · create · cancel | **un** geste |
| `billing.misc_payments` | view · create · **validate** · cancel | **deux** |
| `treasury.transfers` | create · **validate** · cancel | **deux** |

`Module 07` §46 le confirme mot pour mot pour le paiement divers : « Brouillon ;
Validé ; Annulé ». `Module 06` §45 nomme, parmi les notifications du module,
« opération nécessitant une validation ».

La distinction n'est pas de forme :

> Un **règlement** constate un mouvement déjà survenu — il naît validé.
> Un **virement** et un **paiement divers** *décident* d'un mouvement — l'argent
> ne bouge qu'à la validation.

C'est aussi le seul ordre qui permette au contrôle de solde de `Module 06` §30
de porter sur **l'instant où les fonds sortent**, et non sur un chiffre déjà
périmé au moment où l'opération s'exécute.

### 3.2 La capacité qui manquait — `treasury.transfers.view`

Le catalogue de la migration 007 ouvrait le menu « Virements internes » avec
`create`, `validate` et `cancel`, **sans lecture**.

Or un virement en brouillon n'a produit **aucune écriture** : il n'apparaît ni au
journal des mouvements, ni sur le solde d'un compte. Sans capacité de lecture,
**personne ne pouvait ouvrir un brouillon pour le valider** — une capacité de
validation sans lecture est inapplicable.

Elle n'est déduite d'aucune autre (DEC-024, CLAUDE.md §19 bis) :

- `treasury.entries.view` ouvre les **mouvements** — un brouillon n'en a aucun ;
- `treasury.transfers.create` ouvre l'**acte de saisir** — pas celui de lire.

L'entrée de navigation, qui portait `transfers.create` faute de mieux, porte
désormais la lecture : un valideur qui ne saisit pas voit l'écran, un lecteur
aussi.

**Catalogue : 170 → 171.** Et rien d'autre : ni `.update`, ni `.export`, ni
`.download`, ni `.print` pour ces deux menus.

### 3.3 Ce qui n'a PAS demandé d'arbitrage

| Question | Réponse déjà écrite |
| --- | --- |
| Contrôle du solde au virement | `Module 06` §30 — « pour le MVP, l'option la plus sûre est de **bloquer** ». Appliqué. |
| Découvert ailleurs | DEC-029 §b — aucune règle définie, **aucun contrôle**. Inchangé. |
| Sens d'un paiement divers | §44 dit « compte **source** » : c'est une SORTIE. |
| Catégories d'un paiement divers | §43 en cite quatre. Les quatre, ni plus ni moins. |
| Format des références | `transfer` → `VIR` (migration 005) ; `payment` → `REG`, partagée (DEC-031). Aucun format inventé. |
| Modification d'un paiement divers | `billing.misc_payments.update` n'existe pas au catalogue → **aucune modification**. Il s'annule (§47). |

---

## 4. Le cœur du lot — un virement ne peut jamais exister à moitié

C'est l'exigence que le lot devait tenir, et celle qui a demandé le plus de
travail : *« le système ne doit jamais pouvoir produire un état dans lequel le
débit existe sans le crédit correspondant, ou inversement. »*

### 4.1 Les cinq couches habituelles ne suffisaient pas

Les couches reconduites depuis l'audit 041–042 encadrent les **actes** :

| Couche | Ce qu'elle tient |
| --- | --- |
| 1 — Fonction | chaque acte vérifie SA capacité par `require_capability` |
| 2 — Donnée | comptes, montant, date figés dès la saisie ; écriture immuable |
| 3 — Transition | Brouillon → Validé → Annulé, chaque passage sous sa capacité |
| 4 — RLS | lecture, création, validation, annulation |
| 5 — État de départ | un `INSERT` direct ne fait naître ni virement ni paiement « validé » |

Aucune de ces cinq n'empêche, **à elle seule** :

- qu'un `PATCH` direct passe un virement à « Validé » sans produire d'écriture ;
- qu'un porteur de `treasury.entries.create` greffe une **troisième** écriture
  sur un virement déjà validé.

Dans les deux cas, les gardes de ligne ne voient qu'une opération isolée, jugée
sur elle-même. Le déséquilibre n'existe qu'**entre** les lignes.

### 4.2 La sixième couche — une garde différée

```sql
create constraint trigger internal_transfers_consistent
  after insert or update on public.internal_transfers
  deferrable initially deferred
  for each row execute function public.fn_internal_transfer_consistent();
```

Elle s'exécute **quand tout est écrit**, à la validation de la transaction, et
refuse celle-ci **dans son ensemble** si le compte n'y est pas.

| État du virement | Ce que la garde exige |
| --- | --- |
| **Brouillon** | aucune écriture |
| **Validé** | **exactement deux** — une SORTIE sur la source, une ENTRÉE sur la destination, du même montant |
| **Annulé** | aucune écriture **validée** ; les deux, annulées, restent (§33) |

La même garde vaut pour le paiement divers : validé, il porte **exactement une**
écriture de sortie, du montant payé, sur son compte source.

Une **troisième** garde est posée sur `treasury_entries` elle-même : sans elle,
une écriture ajoutée à un virement déjà validé passerait, la ligne du virement
n'ayant pas bougé — et son propre contrôle ne s'exécuterait pas.

### 4.3 Une garde qui COMPTE doit compter la vérité

Ces gardes lisent `treasury_entries` **sous RLS**. Un appelant sans
`treasury.entries.view` n'en verrait aucune et conclurait « zéro ».

Le sens de l'erreur est ici un **refus**, jamais un accord — la garde est donc
sûre. Mais un refus subi après coup, sans motif lisible, est un mauvais refus.

Les quatre actes qui la déclenchent exigent donc `treasury.entries.view`
**nommément**, avec son motif — la doctrine de la migration 054 appliquée **en
amont** plutôt qu'après coup :

```
validate_internal_transfer   « produire et relire les deux écritures du virement »
cancel_internal_transfer     « annuler les écritures produites par ce virement »
validate_misc_payment        « produire et relire l'écriture du paiement »
cancel_misc_payment          « annuler l'écriture produite par ce paiement »
```

**Valider un virement réunit ainsi cinq capacités** — `transfers.validate`,
`transfers.view`, `accounts.view`, `balances.view` et `entries.view`. Aucune
n'est du décor : §30 contrôle un **solde**, qui est la somme d'**écritures**, sur
des **comptes** qu'il faut lire.

### 4.4 Et l'écriture dit toujours la vérité sur son origine

`fn_treasury_entry_source` est étendue aux deux nouvelles origines. Le SENS est
imposé par l'origine, jamais choisi :

| Origine | Sens | Compte |
| --- | --- | --- |
| Règlement fournisseur | SORTIE | le compte réglé |
| Règlement client | ENTRÉE | le compte encaissé |
| **Paiement divers** | **SORTIE** | le compte source |
| **Virement, côté source** | **SORTIE** | le compte source |
| **Virement, côté destination** | **ENTRÉE** | le compte destination |

Toute autre combinaison — une entrée sur la source, une sortie sur un troisième
compte, un montant différent — **fabriquerait de l'argent**. Elle est refusée.

Une contrainte `treasury_entries_single_origin` garantit par ailleurs qu'une
écriture ne se réclame **que d'une seule** opération, sur les quatre origines
désormais possibles.

---

## 5. Le contrôle de solde — §30, et lui seul

> `Module 06` §30 : « Pour le MVP, l'option la plus sûre est de **bloquer** le
> virement lorsque les fonds disponibles sont insuffisants. »

Il est appliqué **là, et nulle part ailleurs**. DEC-029 §b reste entière : la
documentation ne définit ni découvert autorisé ni seuil pour les règlements ni
pour les paiements divers, et en inventer un serait créer une règle métier.

Le contrôle porte sur la **validation**, non sur la saisie :

- c'est à la validation que les fonds sortent ;
- un solde contrôlé à la saisie serait périmé au moment où l'argent bouge ;
- l'exiger plus tôt obligerait la personne qui **saisit** à détenir
  `treasury.balances.view`, ce que DEC-024 refuse de déduire.

L'écran, lui, **annonce** le solde avant la tentative et désactive le bouton
quand il manque — un confort de lecture, jamais une protection : la fonction
refuse de toute façon.

*L'**annulation** d'un virement validé n'est pas soumise à ce contrôle : rendre
l'argent au compte source peut rendre le compte destination négatif, et le
refuser inventerait une règle qu'ADIKOM n'a pas posée.*

---

## 6. Ce que les écrans livrent

### 6.1 Virement interne — `Module 06` §29 à §33

| Écran | Ce qu'il fait |
| --- | --- |
| `/tresorerie/virements` | Liste, recherche (référence, motif), filtres compte / état / période. Le **trajet** est présenté sur une ligne : « source → destination ». Un bandeau annonce les brouillons en attente. |
| `/tresorerie/virements/nouveau` | Les huit champs de §29 : source, destination, montant, devise (reprise), date, motif, référence, commentaire. |
| `/tresorerie/virements/[id]` | Le trajet, les **deux écritures** retrouvables depuis le virement (§32), le suivi daté, et selon les capacités : valider, annuler. |
| `/tresorerie/comptes/[id]` | **Volet Virements** ajouté (§16) : les transferts au départ ou à destination de ce compte, brouillons compris. |

Le libellé de chaque écriture nomme l'autre compte — *« Virement VIR-2026-000001
— vers Banque ADIKOM »* — pour qu'une ligne du journal se comprenne seule.

### 6.2 Paiements divers — `Module 07` §43 à §47

| Écran | Ce qu'il fait |
| --- | --- |
| `/facturation/paiements-divers` | Liste, recherche (numéro, bénéficiaire, motif, référence), filtres compte / catégorie / état / période. |
| `/facturation/paiements-divers/nouveau` | Les informations de §44 : compte source, catégorie, montant, date, bénéficiaire, motif, référence, commentaire. |
| `/facturation/paiements-divers/[id]` | La fiche, **l'écriture produite** (§45), le suivi daté, et selon les capacités : valider, annuler. |

**Bénéficiaire et motif sont obligatoires** — §43 : « chaque paiement doit
toutefois être suffisamment documenté ». Un décaissement sans cause écrite ne se
contrôle pas.

### 6.3 Les états UI, à chaque écran

Normal · chargement · succès · erreur · **vide** · **droits insuffisants**.

Trois exemples de ce dernier, qui distinguent l'absence d'une donnée de
l'impossibilité de la lire (DEC-017) :

- sans `treasury.accounts.view`, la liste affiche « Compte non lisible » et non
  une case vide ;
- sans `treasury.entries.view`, la section des écritures **disparaît** — une
  liste vide se lirait « ce virement n'a rien produit » ;
- sans solde calculable, le panneau de validation le **dit**, et rappelle que le
  serveur appliquera le contrôle de toute façon.

---

## 7. Défauts découverts et corrigés

### 7.1 L'annulation était devenue impossible — migration 072

**Trouvé par `db:verify:transfers`, contrôle 11, avant toute livraison.**

`fn_treasury_entry_source` s'exécute `before insert OR UPDATE`. La condition
ajoutée par la migration 071 pour les nouvelles origines — « l'opération dont
l'écriture se réclame doit être **validée** » — est juste à la création, et
fausse à l'annulation :

```
cancel_internal_transfer
  1. virement  → « Annulé »
  2. écritures → « Annulée »      ← rejouait le contrôle
                                     sur un virement désormais annulé
  → « un virement ne produit ses écritures qu'à sa VALIDATION »
```

**Correction (072) :** l'état de l'origine n'est contrôlé qu'à l'`INSERT`. Sur
`UPDATE`, il n'y a rien à contrôler — `fn_treasury_entry_immutable` fige déjà
l'origine, le compte, le montant, le sens, le genre et la date ; seul le statut
change, et seulement pour suivre l'opération.

Le reste du contrôle — compte, montant, sens — demeure sur les deux opérations :
il est vrai dans les deux cas, et le garder maintient la barrière entière.

### 7.2 Annuler l'écriture d'une opération qui n'est pas la sienne — migration 073

**Défaut PRÉEXISTANT, né au LOT 6, élargi au LOT 8 — trouvé à la relecture du
diff de ce lot.**

La policy d'`UPDATE` des écritures était une disjonction de **capacités**, sans
aucun lien avec l'origine de la ligne visée :

```sql
using (
  has_permission('billing.supplier_payments.cancel')
  or has_permission('billing.customer_payments.cancel')
)
```

Un porteur de `supplier_payments.cancel` pouvait donc, par `PATCH` direct,
passer à « Annulée » l'écriture d'un règlement **client** — sans toucher au
règlement, qui restait « Validé ». Le solde du compte remontait, la facture
restait soldée, et **rien n'expliquait l'écart**. C'est l'incohérence que
`Workflow 08` §45 nomme, prise par l'autre bout.

Le LOT 17 l'aurait élargi de **deux capacités de plus**, chacune ouvrant les
écritures des trois autres domaines.

**Pourquoi aucune recette ne l'avait vu.** Toutes éprouvent qu'un acte est
refusé à qui n'a pas la capacité, et possible à qui l'a. Les deux tenaient :
chaque profil annulait bien **son** propre règlement. Ce qu'aucune n'essayait,
c'était d'annuler l'écriture d'un domaine **voisin** — le seul geste que la
policy laissait passer.

**Correction (073) :** la capacité doit correspondre à l'**origine** de la ligne.
C'est déjà la règle de la policy d'insertion (DEC-029 §f) — l'écriture suit la
capacité de l'opération qui la produit ; elle vaut à l'identique pour la défaire.
Une écriture **libre**, sans origine, devient non modifiable : aucun écran n'en
produit, et `treasury.entries.create` n'a pas de capacité d'annulation au
catalogue.

La recette ajoute un profil **`voisin`** qui **lit** les deux écritures d'un
virement — pour que le refus ne puisse pas se confondre avec un effet de RLS de
lecture — et se voit refuser leur annulation.

### 7.3 Un motif réécrivable après coup — migration 074

**Même famille, trouvé dans la foulée.**

Les gardes d'immuabilité protégeaient les colonnes qui portent l'**argent** —
montant, compte, sens, date — et laissaient libres celles qui portent la
**justification** :

| Table | Colonnes laissées libres |
| --- | --- |
| `treasury_entries` | `description`, `reference` |
| `internal_transfers` | `purpose`, `reference`, `notes` |
| `misc_payments` | `external_ref`, `notes` |

Aucun écran ne les modifie, et aucune capacité ne le permet — il n'existe ni
`transfers.update` ni `misc_payments.update`. Mais la policy d'`UPDATE`, ouverte
pour que l'annulation puisse écrire son statut, laissait passer un `PATCH`
direct.

`Module 06` §32 range le **motif** et la **référence** parmi ce que le système
doit conserver d'un virement, au même titre que son montant ; §34 proscrit « la
réécriture de l'historique ». `Module 07` §43 exige qu'un paiement divers soit
« suffisamment documenté ».

> Un montant juste sous une cause fausse n'est pas traçable, et une documentation
> réécrivable ne documente rien.

**Correction (074) :** la justification se fige comme le montant.
`status_reason` reste écrivable — c'est le motif de l'**annulation**, posé par
l'acte d'annuler : le figer interdirait l'acte qui le pose.

### 7.4 Le contrôle de parité de l'audit lisait un seul fichier — test

`audit.test.ts` reconstituait la cartographie `audit_detail_permission` depuis la
migration du LOT 15, **nommée en dur**. Il a signalé les deux nouveaux objets
comme non cartographiés — alors qu'ils l'étaient, dans la migration 071.

Le défaut n'était pas dans le code : il était dans le **contrôle**. Cette
cartographie s'étend à chaque module livré ; figer le fichier du LOT 15 aurait
fait passer le test à côté de tout ce qui vient après — précisément l'oubli
silencieux qu'il existe pour rendre bruyant (DEC-038).

Le test est aligné sur `permissions.test.ts` : il parcourt **toutes** les
migrations qui redéfinissent la fonction, dans l'ordre, la dernière l'emportant.

### 7.5 Deux défauts de recette

| Défaut | Effet | Correction |
| --- | --- | --- |
| `waitForURL('**/virements/**')` | `/virements/**nouveau**` y répondait déjà : la recette repartait avec « nouveau » pour identifiant, et chaque appel suivant échouait sur un UUID invalide **en accusant la base**. | `createdId()` attend une URL contenant un UUID, et refuse de continuer sinon. |
| Attendre le message de succès | Valider retire le panneau de validation ; annuler retire celui d'annulation. Le message part avec eux → recette intermittente. | `actUntil()` relit l'**état affiché ensuite** — la phrase que la fiche porte une fois l'acte accompli. |

Le second est la leçon déjà apprise au LOT 8, reconduite.

---

## 8. Migrations

| N° | Fichier | Contenu |
| --- | --- | --- |
| **071** | `20260906000100_virement_interne_et_paiements_divers.sql` | 1 capacité · 3 types · 2 tables · 2 colonnes d'origine · 6 fonctions d'acte · 2 fonctions de cohérence · **13 déclencheurs, dont 3 différés** · RLS · audit · révocations |
| **072** | `20260906000200_annuler_n_est_pas_recreer.sql` | Correction de `fn_treasury_entry_source` (§7.1) |
| **073** | `20260906000300_annuler_une_ecriture_qui_n_est_pas_la_sienne.sql` | La capacité d'annulation d'une écriture est liée à son **origine** (§7.2) |
| **074** | `20260906000400_un_motif_ne_se_reecrit_pas_apres_coup.sql` | La **justification** se fige comme le montant (§7.3) |

**Aucune fonction n'est `SECURITY DEFINER`** (DEC-022, DEC-026 §f).

### Les six fonctions d'acte

```
create_internal_transfer      transfers.create · transfers.view · accounts.view
validate_internal_transfer    transfers.validate · transfers.view · accounts.view
                              · balances.view · entries.view
cancel_internal_transfer      transfers.cancel · transfers.view · entries.view
create_misc_payment           misc_payments.create · misc_payments.view · accounts.view
validate_misc_payment         misc_payments.validate · misc_payments.view
                              · accounts.view · entries.view
cancel_misc_payment           misc_payments.cancel · misc_payments.view · entries.view
```

### RLS

| Table | SELECT | INSERT | UPDATE |
| --- | --- | --- | --- |
| `internal_transfers` | `transfers.view` | `transfers.create` | `transfers.validate` ou `.cancel` |
| `misc_payments` | `misc_payments.view` | `misc_payments.create` | `misc_payments.validate` ou `.cancel` |
| `treasury_entries` | inchangé | + les deux nouvelles origines, sous la capacité de **validation** | **réécrite (073)** : la capacité d'annulation de **son** origine |

Chaque garde est enveloppée dans un sous-`select` : sans quoi `has_permission`
serait appelée **une fois par ligne lue**.

`DELETE` est révoqué à `authenticated` sur les deux tables, et un déclencheur
`fn_forbid_delete` en interdit la suppression applicative.

---

## 9. Permissions

| | |
| --- | --- |
| Capacités **créées** | **1** — `treasury.transfers.view` |
| Capacités **réutilisées** | 10 — les trois `treasury.transfers.*` restantes, les quatre `billing.misc_payments.*`, `treasury.accounts.view`, `treasury.balances.view`, `treasury.entries.view` |
| Catalogue | 170 → **171** |
| Capacités écartées | `.update`, `.export`, `.download`, `.print` sur ces deux menus |

La nouvelle capacité est marquée **sensible** — comme toutes celles de
trésorerie — et s'insère en tête du menu « Virements internes ».

Le total attendu a été porté à 171 dans les **19 recettes** qui le vérifient,
recettes SQL et recettes fonctionnelles confondues.

---

## 10. Fichiers créés et modifiés

### Créés

```
supabase/migrations/20260906000100_virement_interne_et_paiements_divers.sql
supabase/migrations/20260906000200_annuler_n_est_pas_recreer.sql
supabase/tests/transfers.sql
scripts/verify-transfers.mjs

src/features/misc-payments/constants.ts
src/features/misc-payments/data.ts
src/features/misc-payments/actions.ts
src/features/misc-payments/panels.tsx

src/app/(app)/tresorerie/virements/page.tsx
src/app/(app)/tresorerie/virements/nouveau/page.tsx
src/app/(app)/tresorerie/virements/[id]/page.tsx
src/app/(app)/facturation/paiements-divers/page.tsx
src/app/(app)/facturation/paiements-divers/nouveau/page.tsx
src/app/(app)/facturation/paiements-divers/[id]/page.tsx
```

### Modifiés

```
src/lib/auth/permissions.ts            + TRANSFERS_VIEW
src/lib/navigation.ts                  deux entrées « planned » → « ready »
src/features/treasury/constants.ts     états du virement
src/features/treasury/data.ts          listInternalTransfers, getInternalTransfer
src/features/treasury/actions.ts       trois actions de virement
src/features/treasury/panels.tsx       trois panneaux de virement
src/features/audit/constants.ts        deux types d'objet au journal
src/features/audit/audit.test.ts       parité rejouée sur TOUTES les migrations
src/app/(app)/tresorerie/comptes/[id]/page.tsx   volet Virements (§16)
src/app/(app)/tresorerie/ecritures/page.tsx      le bandeau ne ment plus
package.json                           db:verify:transfers, verify:transfers
19 recettes                            catalogue 170 → 171
```

Aucun composant d'interface n'a été créé : `Field`, `Select`, `Notice`, `Card`,
`Badge`, `EmptyState`, `SubmitButton` couvraient tout (CLAUDE.md §37).

---

## 11. Tests

### 11.1 Recette SQL — `npm run db:verify:transfers` · **19 contrôles**

Exécutée avec la clé de service, qui contourne RLS et les gardes de capacité :
elle éprouve donc le **schéma** et les **règles**.

| # | Ce qui est vérifié |
| --- | --- |
| 1 | Deux tables, trois types, aucun montant flottant, aucun solde stocké |
| 2 | Catalogue à 171 ; aucune capacité surnuméraire créée |
| 3 | Trois comptes, dont un dans une autre devise |
| 4 | **Sept refus** à la saisie : comptes identiques, montant nul, négatif, date absente, devises différentes, compte source archivé, compte destination archivé |
| 5 | Le brouillon : numéroté `VIR`, devise reprise, **aucune écriture** |
| 6 | **Cinq refus** : écriture anticipée, écriture orpheline, réécriture du montant, échange des comptes, `INSERT` né validé — et la suppression fermée |
| 7 | **§30** — fonds insuffisants : refus, et l'état n'avance pas |
| 8 | **§31** — deux écritures liées, 700 000 / 500 000, **total inchangé** |
| 9 | **Cinq refus** de cohérence : demi-virement, écriture surnuméraire, mauvais sens, compte étranger, montant différent |
| 10 | L'écriture est immuable : montant, origine ; suppression fermée |
| 11 | **§33** — annulation : deux écritures annulées, soldes revenus, historique conservé |
| 12 | **Cinq refus** à la saisie d'un paiement divers |
| 13 | Le brouillon : numéroté `REG`, aucune écriture |
| 14 | **Cinq refus** : montant, compte, bénéficiaire, écriture anticipée, `INSERT` validé |
| 15 | **§45** — une sortie de 45 000 KMF, solde à 955 000 |
| 16 | **Quatre refus** : paiement validé sans écriture, écriture surnuméraire, sens inversé, double origine |
| 17 | **§47** — écriture annulée, solde revenu, historique conservé |
| 18 | Journal : les deux objets nommés (DEC-038), leurs actes tracés (§49) |
| 19 | Contrainte d'origine et policy d'insertion étendues, **sans rien retirer** |

Les gardes différées ne s'exécutant qu'à la validation d'une transaction — que
ce script ne fait jamais —, `set constraints all immediate` les déclenche
explicitement, dans un sous-bloc dont l'échec est attendu.

### 11.2 Recette de production — `npm run verify:transfers` · **52 contrôles**

Exécutée **contre la production**, avec de vraies sessions aux capacités
minimales, par l'écran **et** par appel direct.

Quatre profils, chacun portant exactement ce qu'il faut éprouver :

| Profil | Ce qu'il détient | Ce qu'il doit se voir refuser |
| --- | --- | --- |
| `full` | tout, légitimement | rien |
| `saisie` | `transfers.view` + `.create` | **valider** |
| `valideurAveugle` | `transfers.validate` + `.cancel`, **sans** `entries.view` | tout acte qui produit ou défait une écriture |
| `ecritures` | `entries.view`, **sans** `transfers.view` | **l'écran des virements** |
| `voisin` | `supplier_payments.cancel` + `customer_payments.cancel` + `entries.view` | **annuler l'écriture d'un virement** — qu'il LIT pourtant (migration 073) |

| Section | Ce qu'elle prouve |
| --- | --- |
| 1 | Sans `transfers.view` : écran fermé, menu absent, **et RLS masque la table** |
| 2 | Saisir n'est pas valider — refusé à l'écran, par RPC **et** par `PATCH` |
| 3 | **Le demi-virement est impossible** — `PATCH` « validé » sans écriture refusé par la garde différée ; l'état reste `DRAFT` |
| 4 | La validation déplace les deux soldes (700 000 / 500 000), lus **à l'écran des comptes** ; une écriture surnuméraire est refusée ; **le voisin lit les deux écritures et ne peut pas les annuler** |
| 5 | §30 — l'écran annonce le solde insuffisant, le serveur refuse, l'état n'avance pas |
| 6 | §33 — les deux écritures annulées, les soldes revenus, l'historique conservé |
| 7 | Paiement divers : brouillon, `PATCH` sur le montant refusé, validation qui débite, annulation qui rend |
| 8 | §10 — compte archivé, compte identique : refusés |
| 9 | DEMO intactes, catalogue à 171, opérations journalisées |

### 11.3 Tests unitaires, build

```
npm run test        219 tests   ✔
npm run typecheck              ✔
npm run lint                   ✔
npm run build       58 routes  ✔
```

---

## 12. Non-régressions vérifiées

Toutes exécutées **contre la production**, après déploiement.

| Recette | Résultat |
| --- | --- |
| **19 recettes SQL** hors LOT 17 (`db:verify` et `db:verify:*`) | ✔ **314 contrôles** |
| `verify:capabilities` | ✔ **206 contrôles** |
| `verify:treasury` | ✔ 34 contrôles |
| `verify:customer-payments` | ✔ **36 contrôles** |
| `verify:supplier-invoices` | ✔ **37 contrôles** |
| `verify:payments` (informations de règlement fournisseur) | ✔ **32 contrôles** |
| `verify:customer-invoices` | ✔ **52 contrôles** |
| `verify:imputations` | ✔ **47 contrôles** |
| `verify:audit` | ✔ **81 contrôles** |

**Total : 839 contrôles de non-régression, tous verts.**

L'engagement le plus lourd portait sur `treasury_entries` : **trois** de ses
déclencheurs ont été redéfinis, et **deux de ses policies remplacées** — dont
celle d'`UPDATE`, resserrée par la migration 073. Toute la chaîne financière en
dépend : règlements fournisseurs, règlements clients, soldes, tableau de bord.
`verify:capabilities`, `verify:treasury` et `verify:customer-payments` ont donc
été **rejouées après** les migrations 073 et 074, et non seulement avant.

> **Deux recettes n'ont pas pu être exécutées** — `verify:users:ui` et
> `verify:permissions` exigent `ADIKOM_ADMIN_USERNAME` et
> `ADIKOM_ADMIN_PASSWORD`, absentes de `.env.local`. Constat identique aux
> LOTs 14, 15 et 16.

---

## 13. GitHub et Vercel

| | |
| --- | --- |
| Dépôt | `moraproentrepreneur-hash/ADIKOM-PILOT`, branche `main` |
| Commit | `02a656a` |
| SHA local / distant | **identiques** |
| Secrets | Diff vérifié — **aucune valeur secrète** |
| Vercel | Déploiement `READY` sur `02a656a` |

---

## 14. État de la base après le lot

| | |
| --- | --- |
| Migrations appliquées | jusqu'à **074** |
| Catalogue de permissions | **171** (+1) |
| Tables créées | `internal_transfers`, `misc_payments` |
| Colonnes ajoutées | `treasury_entries.internal_transfer_id`, `.misc_payment_id` |
| Types créés | `internal_transfer_status`, `misc_payment_status`, `misc_payment_category` |
| Règles de numérotation | 14 — inchangées ; `transfer` enfin consommée |
| Données DEMO | **3 clients · 3 véhicules · 3 fournisseurs** — intactes |
| Résidus de recette | **aucun** — balayage final par marqueur : 0 compte financier, 0 utilisateur, 0 tiers, 0 véhicule |

Balayage final, à la fermeture du lot :

```
Catalogue                            171 capacités
Clients · Véhicules · Fournisseurs   3 · 3 · 3 DEMO
Règles de numérotation               14
Virements en base                    0
Paiements divers en base             0
Comptes, utilisateurs, tiers de recette   0
```

---

## 15. Ce qui n'a volontairement pas été implémenté

| Non livré | Pourquoi |
| --- | --- |
| **Justificatif** de paiement divers (`Module 07` §44) | Aucune capacité de document n'existe pour ce menu ; en créer une d'office inventerait une fonctionnalité (DEC-024 ; précédent DEC-029 §i pour le règlement). |
| **Mode de paiement** sur le paiement divers | §44 énumère ses informations et n'en cite pas. Le **type du compte** — banque ou caisse — dit déjà par où l'argent est sorti. |
| **Modification** d'un virement ou d'un paiement divers | Aucune capacité `.update` au catalogue. Un brouillon erroné **s'annule** (`Module 06` §33, `Module 07` §47). |
| **Écriture libre** — dépôt, retrait, correction | `treasury.entries.create` reste sans écran. Les trois figurent au vocabulaire de `Module 06` §20 et §34 ; aucun acte ne les produit. |
| **Export** des virements et des paiements divers | Aucune capacité ne le couvre (DEC-024). Se rattache aux arbitrages 15 et 24. |
| **Rapprochement bancaire** (§42), **seuils d'alerte** (§46) | Rangés « futurs » par la documentation elle-même. |
| **Notification « virement effectué »** (§45) | Suppose de désigner ses destinataires — arbitrage ouvert n° 16. |
| **Contrôle de découvert hors virement** | DEC-029 §b : aucune règle définie. Arbitrage ouvert n° 2. |

---

## 16. Arbitrages restant ouverts

Le lot **n'en ajoute aucun**, et en fait **avancer un**.

**Arbitrage n° 8 (DEC-029 §c) — partiellement tranché.** La question « ADIKOM
souhaite-t-elle séparer la saisie et la validation d'un paiement ? » est
**tranchée là où le catalogue offrait déjà la capacité** : le virement interne
et le paiement divers se saisissent puis se valident (DEC-040 §a). Elle reste
**ouverte pour les règlements** clients et fournisseurs, qui n'ont pas de
capacité de validation : la créer serait une décision d'organisation.

Les arbitrages n° 2 (découvert autorisé), 15 et 24 (export d'états) sont
**touchés** par ce lot sans être modifiés.

---

## 17. Pour reprendre le projet

### Où en est le produit

| Module | État |
| --- | --- |
| 01 — Tableau de bord | ✔ (LOT 9) |
| 02 — Centre de notifications | ✔ (LOT 10) |
| 03 — Projets & Planification | ✔ (LOTs 12, 13) |
| 04 — Tiers | ✔ |
| 05 — Gestion de location | ✔ |
| **06 — Banques & Caisses** | ✔ **complet — LOT 17** |
| **07 — Facturation & Paiement** | ✔ **complet — LOT 17** |
| 08 — Utilisateurs & Groupes | ✔ (LOTs 14, 15) |
| 09 — Paramètres | ✔ (LOT 16) |

**Les neuf modules annoncés sont ouverts, et plus aucune entrée de navigation
n'est « À venir ».**

Ce qui reste relève des **arbitrages ADIKOM** — 29 questions ouvertes au journal
des décisions — et non de fonctionnalités oubliées.

### Commandes utiles

```bash
npm run db:push                # appliquer les migrations
npm run db:verify:transfers    # recette SQL du LOT 17 (19 contrôles)
npm run verify:transfers       # recette de production (52 contrôles)
npm run verify                 # lint + typecheck + tests + build
```

> **Piège toujours d'actualité :** si `npm run typecheck` échoue sur des routes
> typées alors que `next build` passe, supprimer `.next/dev/types`.

> **Ne jamais piper une recette vers `head`** : SIGPIPE tue le processus avant
> son nettoyage, et laisse des comptes financiers en base.

---

## 18. Bilan

| | |
| --- | --- |
| Contrôles SQL | **19** — tous verts |
| Contrôles de production | **52** — tous verts |
| Contrôles de non-régression | **839** — tous verts (314 SQL + 525 fonctionnels) |
| Tests unitaires | **219** — tous verts |
| Capacités ajoutées | **1** — catalogue à 171 |
| Tables ajoutées | **2** |
| Défauts découverts et corrigés | **6** — 3 migrations (dont **2 préexistants**), 1 test, 2 recette |
| Arbitrages ouverts ajoutés | **0** — un avance |
| Résidus de recette | **aucun** |
| Données DEMO | **intactes** |

---

**ADIKOM PILOT — LOT 17**

> Un virement n'est ni une recette ni une dépense.
> Il ne peut pas exister à moitié.
> Et un paiement sans facture se documente, sinon il ne se contrôle pas.
