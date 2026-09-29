# Rapport 20 — Correctif pré-LOT 27

**Intégrité de création des factures fournisseurs**

| | |
| --- | --- |
| Date | 29 septembre 2026 |
| Nature | **Correctif de sécurité ciblé.** Pas un lot, pas une décision métier |
| DEC | 🟥 **Aucune.** Voir §8 |
| Point de départ | `b0786a5` · 106 migrations · 229 capacités · 62 tables sauvegardées |

---

# 1. Problème constaté

Un utilisateur porteur de `billing.supplier_invoices.create` pouvait **insérer
directement une ligne dans `supplier_invoices` par PostgREST**, sans passer par
`create_supplier_invoice`.

Il contournait ainsi, d'un seul geste :

- le **numéroteur** — il écrivait lui-même `invoice_no`, avec la valeur de son
  choix ;
- les **contrôles métier** de la fonction : fournisseur existant, date
  obligatoire, échéance cohérente ;
- la **capacité `parties.suppliers.view`**, que la fonction exige pour ne pas
  rattacher une dette à un tiers qu'on n'a pas le droit de consulter ;
- la **capacité `commerce.purchase_orders.view`**, exigée dès qu'une commande
  est nommée.

La dette était **antérieure au LOT 26** et documentée au **Rapport 19 §13.2**.

---

# 2. Cause

La policy d'INSERT disait ceci, et rien de plus :

```sql
with check ( has_permission('billing.supplier_invoices.create') )
```

Elle répond à **« CET UTILISATEUR a-t-il le droit de créer ? »**. Elle ne répond
jamais à **« cette ligne naît-elle PAR LE CHEMIN PRÉVU ? »**.

Les deux questions sont distinctes, et la seconde n'était posée nulle part.

**Pourquoi la faiblesse n'avait jamais été vue.** L'index d'unicité
`supplier_invoices_one_per_purchase_order_idx` refusait l'insertion directe la
plus naturelle — celle rattachée à une commande déjà facturée. La recette y
lisait « l'index partiel fait autorité » et concluait que le chemin direct était
fermé. **DEC-053 a retiré cet index**, et l'insertion est passée : la garde
qu'on croyait tenir était un effet de bord.

> C'est une contrainte d'**unicité** qui masquait un défaut d'**intégrité**.
> Les deux n'ont rien à voir, et l'une ne protège l'autre que par accident.

---

# 3. Correction

## 3.1 Le mécanisme n'est pas nouveau — il était déjà dans le projet

Aucune invention. La correction reprend **exactement** le motif qui protège le
compteur de numérotation depuis la migration 013 (§16) : un **drapeau local à la
transaction**, posé par la fonction de confiance juste avant son écriture, et
relu par un déclencheur.

```
create_supplier_invoice
   ├─ set_config('adikom.supplier_invoice', 'on', true)
   ├─ INSERT  ──▶  déclencheur : le drapeau est-il posé ?  ──▶ oui, passe
   └─ set_config('adikom.supplier_invoice', 'off', true)

INSERT direct par PostgREST
   └─ INSERT  ──▶  déclencheur : le drapeau est-il posé ?  ──▶ non, REFUS 42501
```

Trois propriétés font que le drapeau n'est pas contournable :

1. **`set_config` vit dans `pg_catalog`.** PostgREST n'expose que le schéma
   applicatif : aucun appel d'API ne peut poser ce réglage.
2. **Il est local à la transaction**, et chaque requête PostgREST est sa propre
   transaction.
3. **Il est refermé immédiatement après l'insertion.** Un contexte qui lève une
   garde ne doit pas survivre à l'acte qui l'a ouvert — sans quoi une écriture
   ultérieure de la même transaction en profiterait.

## 3.2 🟥 Aucune fonction ne devient `SECURITY DEFINER`

`create_supplier_invoice` reste **`SECURITY INVOKER`**, et le déclencheur aussi :
il ne lit que `current_setting` et `is_restoring()`, cette dernière étant déjà
accordée à `authenticated`. C'est d'ailleurs l'idiome exact des gardes de
restauration écrites au LOT 8.

**La doctrine D4 n'est pas entamée, et aucune évolution d'architecture n'a été
nécessaire** — le projet portait déjà le mécanisme qu'il fallait. La migration
**vérifie** qu'aucune des deux fonctions n'est `SECURITY DEFINER`.

## 3.3 🟥 Le déclencheur passe en DERNIER, et c'est délibéré

PostgreSQL exécute les déclencheurs `BEFORE ROW` dans **l'ordre de leur nom**.
Le nouveau s'appelle `supplier_invoices_zzz_born_by_function`.

S'il passait en premier, il **masquerait les refus des gardes existantes**. Une
insertion directe née « validée » serait refusée pour la **mauvaise raison** :
les recettes du LOT 5, qui attendent `check_violation` de `starts_draft`,
recevraient `42501`. Elles **cesseraient d'éprouver ce qu'elles nomment sans
qu'aucune ne devienne rouge** — le pire des deux mondes.

En dernier, il ne prend la parole que lorsque tout le reste est satisfait :
c'est-à-dire exactement dans le cas qu'il est **seul** à savoir refuser — une
ligne parfaitement formée, mais qui n'est pas passée par la fonction.

La migration vérifie qu'**aucun déclencheur ne passe après lui**.

## 3.4 La restauration garde son passage

`is_restoring()` exige **à la fois** l'absence de session applicative **et** le
contexte de reprise. Un utilisateur connecté, fût-il Super Admin, ne le satisfait
jamais. La migration vérifie que la garde en tient compte : sans cela, plus
aucune sauvegarde ne se remettrait en place.

---

# 4. Comportement avant / après

| Cas | Avant | Après |
| --- | :-: | :-: |
| **A** · autorisé, `create_supplier_invoice` | ✅ | ✅ **inchangé** |
| **B** · le même, `INSERT` direct PostgREST | 🟥 **ACCEPTÉ** | ✅ **REFUSÉ** |
| **C** · sans `create`, la fonction | ✅ refusé | ✅ refusé |
| **C bis** · sans `create`, `INSERT` direct | ✅ refusé (RLS) | ✅ refusé |
| **D** · contourner le numéroteur | 🟥 **POSSIBLE** | ✅ **IMPOSSIBLE** |
| Création depuis une commande | ✅ | ✅ **inchangé** |
| Plusieurs factures par commande (DEC-053) | ✅ | ✅ **inchangé** |
| Restauration de sauvegarde | ✅ | ✅ **inchangé** |
| Facture née validée par `INSERT` | ✅ refusé | ✅ refusé, **et par la même garde qu'avant** |

Le refus porte le motif que l'utilisateur doit lire :

> *Opération refusée : une facture fournisseur s'enregistre par la fonction
> prévue, jamais par écriture directe. Sans elle, la facture porterait un numéro
> choisi à la main.*

---

# 5. Migration

| | |
| :-: | --- |
| **107** | `20260929000300_une_facture_fournisseur_nait_par_sa_fonction.sql` |

Elle contient : le déclencheur `fn_supplier_invoice_born_by_function`, sa pose en
dernier, la reprise de `create_supplier_invoice` **depuis sa dernière version
active** (migration 105, celle de DEC-053) avec **deux lignes ajoutées** autour
de l'insertion, et 12 contrôles.

🟥 **Aucune table, aucune colonne, aucune policy RLS, aucune capacité.** La
policy d'INSERT n'est pas touchée : elle continue de répondre à « qui », et
c'est le déclencheur qui répond à « par où ».

---

# 6. Tests ciblés

## 6.1 Périmètre déterminé avant de tester

| Question | Réponse |
| --- | --- |
| Modules modifiés | Facturation fournisseur uniquement |
| Fonctions partagées | `create_supplier_invoice` — appelée par `create_invoice_from_purchase_order` |
| Tables, policies, RLS | **Aucune** — un déclencheur ajouté |
| Dépendances pouvant régresser | Commerce fournisseur (la commande facture par cette fonction), le catalogue de capacités (il éprouve l'`INSERT` direct), la restauration |

## 6.2 Exécuté

| | Résultat |
| --- | :-: |
| Vérification ciblée **A/B/C/D** | ✅ **13 contrôles**, 0 résidu |
| `npm run lint` | ✅ |
| `npm run typecheck` | ✅ |
| `npm run test` | ✅ **401 tests**, 19 fichiers |
| `npm run build` | ✅ |
| `db:verify:supplier-invoices` | ✅ — **section 8 bis** ajoutée |
| `db:verify:purchasing` | ✅ 28 sections |
| `db:verify:commerce` | ✅ 28 sections |
| `verify:purchasing` | ✅ **163 contrôles** (+2) |
| `verify:supplier-invoices` | ✅ **37 contrôles** |
| `verify:capabilities` | ✅ **217 contrôles** |
| **Total contrôles de production** | **430** |

## 6.3 La recette qui manquait

`supabase/tests/supplier_invoices.sql` **§8** éprouve qu'une facture ne naît pas
dans le **mauvais état** — validée, en attente. Elle ne disait **rien** d'une
facture parfaitement formée, en brouillon, insérée directement. C'est
précisément celle qui passait.

**§8 bis** ajoute ce contrôle, avec deux garanties :

- une **anti-vacuité** : elle vérifie que la création normale **consomme bien un
  numéro** (`current_value` passe de *n* à *n+1*). Sans cela, le refus de
  l'écriture directe pourrait « réussir » parce que **plus aucune création n'est
  possible** — ce qui serait un défaut, pas une garde ;
- une **seconde tentative directe après une création réussie**, dans la même
  transaction, pour prouver que le drapeau **ne survit pas** à l'acte qui l'a
  ouvert.

`verify-purchasing.mjs` éprouve la même chose en production, sur une facture
**valide à tous égards** — bon fournisseur, bonne commande.

## 6.4 🟥 Non rejoué volontairement

Conformément à `CLAUDE.md` §47 bis : les 20 recettes de production et les 28
recettes SQL historiques n'ont **pas** été rejouées.

| Non rejoué | Pourquoi |
| --- | --- |
| **Cycle destructif de sauvegarde** | `backup_scope`, `backup_columns`, le format et le moteur sont **inchangés**. La garde connaît `is_restoring()`, et la migration le vérifie. Une **sauvegarde préalable** a été prise et vérifiée : **221 lignes / 221**, 62 tables |
| Location, avenants, périodes, relevé | Aucune fonction de location touchée |
| Commerce client, factures clients | `customer_invoices` n'est pas concernée — la correction ne touche que le fournisseur |
| Trésorerie, paiements, imputations | La correction agit **à la création** de la facture, avant toute dette et tout règlement |
| Analytics, mots de passe, utilisateurs, responsive, pilotage | Aucun écran, aucune route, aucune capacité |

---

# 7. Une intermittence observée, et signalée

Lors d'un passage, `src/lib/exports/workbook.test.ts` — « fige l'en-tête et pose
les filtres » — a échoué **une fois**, sur une exécution anormalement lente
(85 s contre 29 s d'ordinaire, machine chargée). Il passe **seul** et dans la
**suite complète** lors des deux exécutions suivantes.

Il est **sans rapport** avec cette correction : ce test n'approche ni les
factures fournisseurs, ni la base. Il est signalé ici plutôt que tu, **sans être
présenté comme résolu** : une intermittence qui n'a été ni reproduite ni
expliquée reste une intermittence.

**Deux recettes de production** ont également échoué une fois chacune sur un
symptôme réseau — `fetch failed` pendant la mise en place pour `verify:purchasing`,
`page.goto: Timeout 30000ms` sur l'écran de connexion pour
`verify:supplier-invoices`. Les deux ont **nettoyé derrière elles** avant de
s'interrompre, et ont été **rejouées** au vert.

La règle du projet n'autorise le rejeu que sur un symptôme **réseau**, jamais sur
un contrôle en échec — un défaut intermittent finirait sinon par « passer ».

---

# 8. Pourquoi aucune DEC

Le brief le prévoyait : **une simple correction de sécurité conforme à la
doctrine existante n'appelle pas de décision.**

C'est le cas ici. Rien de nouveau n'a été décidé :

- le mécanisme du drapeau transactionnel est **déjà en vigueur** (migration 013) ;
- la doctrine D4 est **respectée**, non amendée ;
- aucune règle métier ne change : ni le cycle, ni la numérotation, ni DEC-053 ;
- aucune capacité n'est créée, donc aucune attribution nouvelle.

Le Journal des décisions consigne les **décisions**, pas les **corrections**.

Le **Rapport 19 §13** a reçu un **renvoi** marquant la dette soldée — le corps du
rapport clôturé n'est pas réécrit, conformément à la convention appliquée au
Rapport 18.

---

# 9. Livraison

| | |
| --- | --- |
| Commit | `3cabf03` |
| **SHA applicatif éprouvé** | **`3cabf03`** — le code que les recettes de production ont exercé |
| **SHA déployé et vérifié** | **`3cabf03`** · Vercel **READY**, relevé par l'API REST · production **200** |
| GitHub | `main` = `origin/main` |
| Migrations | 106 → **107** |
| Catalogue | **229** → **229** |
| `backup_scope` | **62** → **62** |
| Résidus | **Aucun** — six familles balayées, comptes de la vérification ciblée supprimés et relus, empreinte DEMO identique |

---

# 10. Ce qui reste ouvert

| # | Point | Nature |
| :-: | --- | --- |
| 1 | **P-5** — prix d'achat par fournisseur au catalogue | 🟥 Toujours ouvert |
| 2 | **Le même chemin sur les autres tables** | 🟦 `customer_invoices`, `sales_orders`, `purchase_orders`, `supplier_payments` présentent **la même forme de policy** : « qui » sans « par où ». Aucune n'a été touchée — le brief demandait de corriger **cette** faiblesse, et une correction de masse ne se décide pas dans un correctif ciblé. **Signalé pour arbitrage** |
| 3 | **Intermittence `workbook.test.ts`** | 🟦 Observée une fois, non reproduite (§7) |
| 4 | **Échéancier fournisseur · remises · A-7 · DEC-008 · P-2** | 🟦 Inchangés |

Le point 2 mérite d'être lu pour ce qu'il est : cette correction ferme **une**
porte, celle que la Direction a demandé de fermer. Elle ne prétend pas que les
autres sont closes.

---

**ADIKOM PILOT — Rapport 20**
**Correctif pré-LOT 27 · Intégrité de création des factures fournisseurs**
