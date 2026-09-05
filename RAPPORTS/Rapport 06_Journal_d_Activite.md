# Rapport 06 — Journal d'activité

**LOT 15** · Phase 4 — Organisation
**Module 08 — Utilisateurs & Groupes** (§54) · **Règles métier 06 — Audit** (intégral)
**Date :** 5 septembre 2026
**Décision associée :** DEC-038
**Commits :** `23b036c` — *le journal dit qui a fait quoi, sans ouvrir ce que chacun n'a pas le droit de voir*
`1d8c473` — *une recherche sans résultat n'est pas une panne, et une garde ne se paie pas par ligne*
**Production :** https://adikom-pilot.vercel.app — `READY` sur `1d8c473`

---

## 1. Objectif du lot

Livrer le **dernier menu** du `Module 08` §3, seul à rester annoncé comme *à
venir* dans la barre latérale :

```
Utilisateurs & Groupes
│
├── Utilisateurs
│   ├── Nouvel utilisateur     ✔ Phase 1
│   ├── Liste des utilisateurs ✔ Phase 1
│   └── Vue hiérarchique       ✔ LOT 14
│
├── Groupes
│   ├── Nouveau groupe         ✔ LOT 14
│   └── Liste des groupes      ✔ LOT 14
│
└── Journal d'activité         ← LOT 15
```

Critères d'acceptation de `06_Audit.md` §82 couverts : **21 à 31**.
Les critères 1 à 20 et 32 à 35 étaient déjà tenus par la migration 004, qui
alimente `audit_log` depuis l'origine.

---

## 2. Analyse préalable

### 2.1 Ce qui existait déjà

Le journal n'avait **rien à créer** en base. Ce qui manquait, c'était l'écran —
et les frontières que cet écran a révélées.

| Élément | Origine | État avant le lot |
| --- | --- | --- |
| `audit_log` (17 colonnes) | migration 004 | **47 382 lignes**, alimentée sans interruption |
| `log_audit()`, `fn_audit_row()` | migration 004 | 48 types d'objet journalisés |
| `fn_audit_permission_change()` | migration 004 | Changements de droits qualifiés à part |
| `fn_audit_price_change()` | migration 007 | Changements de tarif qualifiés à part |
| Protection en écriture seule | migrations 004, 021 | Ni UPDATE, ni DELETE — sauf anonymisation de l'auteur |
| `users.audit.view` · `.export` | migration 007 | Au catalogue, **inutilisables faute d'écran** |
| Policy `audit_log_select` | migration 006 | Posée — avec deux défauts, voir §7 |

### 2.2 Documents consultés

`README.md` · `CLAUDE.md` (§17 à §22, §19 bis, §37, §38, §43, §54, §61)
`00 Documentation/05_Regles_Metier/06_Audit.md` — **intégral**
`00 Documentation/03_Modules/08_Utilisateurs_et_Groupes.md` (§4, §45, §46, §54, §55, §56)
`00 Documentation/08_Decisions/01_Journal_des_Decisions.md` — DEC-011, DEC-017,
DEC-020, DEC-022, DEC-024, DEC-025 §e, DEC-035 §b, DEC-037
`RAPPORTS/Rapport 05_...md`
Migrations 004, 006, 007, 021, 027, 060 à 063.

---

## 3. L'arbitrage central — tranché par les documents

Une question se posait avant de coder, et elle n'était pas mince.

> **`users.audit.view` doit-elle ouvrir la donnée métier de tous les modules ?**

### 3.1 Ce que la question recouvrait

`audit_log.before_data` et `after_data` contiennent la **ligne entière** de la
table auditée. Quarante-huit types d'objet y écrivent :

```
app_users              → email, téléphone, fonction, responsable
clients · suppliers    → coordonnées, conditions
supplier_payment_details → coordonnées de règlement
customer_invoices      → montants, remises, totaux
imputations            → montants imputés
treasury_entries       → mouvements de trésorerie
project_meetings       → comptes rendus
user_permissions       → droits accordés et refusés
```

Une seule capacité rendait tout cela lisible — à un compte qui n'a le droit
d'ouvrir aucun de ces modules.

### 3.2 Pourquoi aucun arbitrage ADIKOM n'était nécessaire

`06_Audit.md` §41 parle d'un « accès **limité** » pour certains responsables,
sans définir la limite. Mais trois règles du socle la définissent à sa place :

| Règle | Ce qu'elle impose |
| --- | --- |
| `06_Audit.md` §62 | Les utilisateurs ne doivent pas consulter **librement** les informations d'audit qui dépassent leurs responsabilités |
| `06_Audit.md` §51 | L'audit dit ce que l'utilisateur **a fait** ; il ne décide jamais de ce qu'il **a le droit de voir** |
| `Module 08` §46 | Un accès aux réservations ne doit pas permettre de récupérer les données financières d'une facture « en modifiant une URL ou une requête » |

La règle retenue est donc **déduite, pas inventée** — et elle **restreint**
plutôt qu'elle n'ouvre, ce qui la rend sûre par défaut.

### 3.3 La règle posée (DEC-038)

```
users.audit.view   ouvre L'ÉVÉNEMENT
                   qui · quoi · quand · sur quel objet · avec quel résultat
                   · pour quel motif · et QUELS CHAMPS ont changé

Le DÉTAIL avant/après n'est rendu qu'à qui détient EN PLUS la lecture de
l'objet concerné — ou au Super Admin (§41).
```

Savoir **qu'un montant a changé** n'est pas connaître le montant. Le contrôle
interne y trouve tout ce que §53 lui demande — qui a créé, qui a validé, qui a
payé — sans que le journal devienne une porte dérobée autour des permissions.

**Catalogue : 170 → 170.** Une capacité `users.audit.detail.view` aurait été une
capacité transversale à **toutes** les données du SaaS, créée d'office : DEC-024
l'interdit.

---

## 4. Architecture

**Aucune table n'est créée.** Le lot ajoute deux barrières, deux lectures et un
index.

### 4.1 Ce que la base gagne

```
audit_log ────────────────┐
  │ SELECT retiré à `authenticated`, rendu colonne par colonne
  │   → before_data et after_data hors de portée de l'API
  │ policy audit_log_select : garde évaluée UNE FOIS (InitPlan)
  ▼
audit_detail_permission(entity_type)  → quelle capacité ouvre ce détail
audit_entry_detail(id)                → arbitre, et NOMME ce qui manque
audit_actors()                        → auteurs du filtre, sous RLS
audit_log_result_idx                  → index partiel sur les échecs et refus
```

### 4.2 Deux barrières, et aucune ne remplace l'autre

| Barrière | Ce qu'elle ferme |
| --- | --- |
| **Droits de colonne** | RLS filtre des **lignes**, jamais des **colonnes**. Tant que `authenticated` détenait le `SELECT` de table, `select=before_data` restait une requête valide pour qui franchissait la policy. |
| **`audit_entry_detail()`** | Seul chemin vers ces colonnes. Exige `users.audit.view`, puis la lecture de l'objet, et **rend toujours une réponse** — jamais un vide qui se lirait « rien n'a changé » (DEC-017). |

La cartographie objet → capacité vit **en base** : une règle de sécurité écrite
en TypeScript ne protège rien d'un appel direct. Elle couvre les 48 types
journalisés et **échoue fermé** — un type non nommé renvoie `NULL`, c'est-à-dire
« Super Admin uniquement ».

La recette SQL lit la liste des tables auditées **dans le catalogue système**,
et non dans une liste recopiée : une table auditée demain fera échouer le
contrôle tant qu'elle n'aura pas sa ligne.

### 4.3 Ce qui est dérivé, jamais stocké

| Valeur | Recalculée par |
| --- | --- |
| Nombre d'événements correspondant aux filtres | le décompte de la page |
| Différence avant / après | `diffFields`, à l'affichage |
| Liste des auteurs du filtre | `audit_actors()` |
| Verdict de lecture d'un détail | `audit_entry_detail()` |

---

## 5. Ce que l'écran livre

### 5.1 La liste — `/utilisateurs/journal`

Six colonnes répondant au §54 : **date et heure · auteur · action · objet ·
module · résultat**. L'auteur est le **nom figé** au moment de l'action : un
compte supprimé reste nommé, un compte désactivé aussi (§81.13).

**Pagination réelle** — 50 par page, 950 pages au moment de la recette. C'est la
seule liste du SaaS dont le volume dépend de la **durée** d'exploitation plutôt
que de l'activité d'ADIKOM ; une limite haute aurait donné un écran
silencieusement tronqué (`Module 08` §56).

### 5.2 Les filtres — §42 à §48

| Filtre | §  | Mise en œuvre |
| --- | --- | --- |
| Recherche libre | §47, §48 | Objet, référence interne, motif, commentaire |
| Auteur | §43 | Peuplé **depuis le journal**, sans `users.users.view` |
| Module | §44 | Sept modules |
| Type d'objet | §47 | 48 types, groupés par module |
| Action | §46 | 19 actions, dans l'ordre où on les cherche |
| Résultat | §60 | Réussie · Échec · Refusée, indexé |
| Période | §45 | Bornes sur le **jour civil comorien** (DEC-025 §e) |

### 5.3 La fiche d'un événement — `/utilisateurs/journal/[id]`

C'est là, et seulement là, que s'ouvre la **situation avant / après**.

Un lecteur qui n'a pas la lecture de l'objet voit :
- l'événement **entier** — auteur, action, objet, résultat, motif, commentaire ;
- la **liste des champs modifiés** — savoir qu'un montant a changé n'est pas le
  connaître ;
- et le refus **nommé**, avec le libellé de la capacité qui l'ouvrirait.

### 5.4 L'export — §64

`users.audit.export`, exigée **en plus** de la lecture : on n'exporte pas ce
qu'on n'a pas le droit de voir. Le classeur porte l'**événement**, jamais la
situation avant/après — un fichier circule, se transfère et se conserve hors du
système, et ne saurait porter un arbitrage qui se fait objet par objet.

Plafonné à 5 000 événements, **annoncés** dans le sous-titre du classeur.
L'export est lui-même journalisé (§64), et son refus aussi (§61).

---

## 6. Ce que la base tient seule

### 6.1 Le journal reste infalsifiable (§40, §77)

Non-régression la plus lourde du lot. Éprouvée par appel direct :

```
UPDATE reason  → permission denied
UPDATE action  → permission denied
DELETE         → permission denied
INSERT         → permission denied
```

Et l'événement observé est **relu** après les quatre tentatives : un refus qui
laisserait la donnée modifiée n'est pas un refus.

### 6.2 La capacité est exigée avant même de chercher

`audit_entry_detail()` vérifie `users.audit.view` **avant** de lire la table.
Un numéro inexistant se refuse donc de la même façon qu'un numéro existant :
sans cet ordre, la fonction dirait à un inconnu quels numéros existent.

---

## 7. Défauts découverts et corrigés

**Trois découverts par la recette de production**, chacun sur un contrôle rouge.

### 7.1 Une page hors bornes rendait une panne — corrigé dans la lecture

PostgREST refuse une plage dont le début dépasse le nombre de lignes
(`PGRST103`). `?page=999999` n'affichait donc pas une liste vide mais
**« Cette page n'a pas pu être affichée »** — une panne annoncée là où il n'y
avait qu'une page inexistante.

La lecture **compte d'abord**, ramène la page dans ses bornes, et ne demande
aucune plage quand il n'y a rien à lire. Une seule requête ne le permettait
pas : le total n'arrive qu'avec les lignes.

### 7.2 La garde s'évaluait une fois par ligne — migration **066**

Plan relevé sous le rôle `authenticated`, avec une session réelle :

```
Seq Scan on audit_log
  Filter: (has_permission('users.audit.view', …) AND (entity_label ~~* …))
  Rows Removed by Filter: 47433
  Execution Time: 2405 ms
```

`has_permission` figurait dans le **filtre de ligne** : 47 433 appels pour une
seule recherche, chacun interrogeant les permissions individuelles, les groupes
et le statut du compte. Deux requêtes composant un écran, plus `audit_actors()`,
le délai maximal d'une requête était dépassé — **c'est ce qui produisait la page
d'erreur du §7.1 sur une recherche sans résultat**.

Enveloppée dans un sous-select, la garde devient un **InitPlan** évalué une
seule fois : **2 405 ms → 249 ms**. La règle d'accès est identique ; seul le
nombre d'appels change.

> **Point signalé, non corrigé ailleurs.** Toutes les policies du SaaS écrivent
> `has_permission(...)` de la même façon. C'est sans conséquence tant que la
> table est petite ; `audit_log` est la seule qui ne décroîtra jamais.

### 7.3 Quatre index qui ne pouvaient pas servir — migrations **065** puis **067**

Des index de trigramme avaient été ajoutés pour la recherche. La mesure a
montré qu'ils ne sont **jamais choisis** sous RLS : une condition de RLS est une
« security qual » évaluée avant toute condition non `leakproof`, et `ILIKE` n'en
est pas. Le même plan, RLS désactivée, les choisit pour un coût cent fois
moindre — la différence est structurelle, pas statistique.

Ils ont été **retirés**. `audit_log` reçoit une ligne à chaque opération du
SaaS : quatre index GIN y auraient alourdi l'écriture qui se trouve sur le
chemin de tout le métier, pour une lecture qui ne les emploie jamais.

> *Un index se justifie par un plan d'exécution mesuré, jamais par la forme de
> la requête. Celui-ci paraissait évident et ne servait à rien.*

### 7.4 PostgREST plafonne à mille lignes, en silence — corrigé dans l'export

`limit(5000)` rend **mille** lignes et n'annonce rien. L'export lit désormais
par tranches de mille et s'arrête de lui-même : une tranche incomplète signifie
qu'il n'y a plus rien à lire. Le décompte exact a été retiré de ce chemin — il
balayait la table entière pour un nombre dont le classeur n'a pas besoin.

### 7.5 Une recette qui écrivait sa propre valeur — recette

Le contrôle « le filtre par module ne laisse passer aucun intrus » lisait le
`<main>` entier, formulaire compris. Or le filtre par module est un `<select>`
qui porte le nom de **tous** les modules : le contrôle trouvait « Gestion de
location » sur un écran filtré sur la trésorerie. Il lit désormais le **corps du
tableau**.

---

## 8. Limite connue, assumée

La recherche reste un parcours complet, donc proportionnelle au volume :
**~250 ms pour 47 000 événements**, de l'ordre de **2,5 s pour 500 000**.

Le jour où ce seuil approchera, la réponse ne sera pas un index — il resterait
inutilisable — mais une **fonction de recherche en `SECURITY DEFINER`**,
vérifiant `users.audit.view` une fois puis interrogeant la table sans RLS, sur
le modèle d'`audit_entry_detail`. Elle n'est pas écrite aujourd'hui : le besoin
n'existe pas encore (CLAUDE.md §29 et §60).

---

## 9. Migrations

| Fichier | Contenu |
| --- | --- |
| `20260905000500_journal_d_activite.sql` | **064** — `audit_detail_permission`, `audit_entry_detail`, `audit_actors` ; retrait du `SELECT` de table sur `audit_log` et grants par colonne ; index partiel sur les résultats non réussis. Aucune table, aucune capacité. |
| `20260905000600_recherche_dans_le_journal.sql` | **065** — quatre index GIN de trigramme. *Défaite par la 067.* |
| `20260905000700_la_garde_du_journal_s_evalue_une_fois.sql` | **066** — la policy `audit_log_select` évalue sa garde une fois ; `analyze`. |
| `20260905000800_un_index_que_le_planificateur_ignore_coute_sans_servir.sql` | **067** — retrait des quatre index, avec la mesure qui le justifie. |

Toutes appliquées sur Supabase Cloud (`npm run db:push`).

---

## 10. Fichiers créés et modifiés

### Créés

```
supabase/migrations/20260905000500_journal_d_activite.sql
supabase/migrations/20260905000600_recherche_dans_le_journal.sql
supabase/migrations/20260905000700_la_garde_du_journal_s_evalue_une_fois.sql
supabase/migrations/20260905000800_un_index_que_le_planificateur_ignore_coute_sans_servir.sql
supabase/tests/audit_journal.sql
scripts/verify-audit.mjs

src/features/audit/constants.ts
src/features/audit/data.ts
src/features/audit/audit.test.ts

src/app/(app)/utilisateurs/journal/page.tsx
src/app/(app)/utilisateurs/journal/[id]/page.tsx
```

### Modifiés

```
src/lib/navigation.ts        ← Journal d'activité : ready
src/lib/exports/registry.ts  ← entrée « journal »
package.json                 ← db:verify:audit, verify:audit
```

---

## 11. Tests

### 11.1 Tests SQL — `npm run db:verify:audit`

**17 contrôles, tous verts.**

| # | Contrôle |
| --- | --- |
| 1 | Catalogue à 170 ; les deux capacités existent ; aucune capacité d'audit inventée |
| 2 | **Toute table auditée sait quelle capacité ouvre son détail** — lue dans le catalogue système |
| 3 | Chaque capacité citée existe, et aucune n'est celle du journal |
| 4 | `before_data` et `after_data` hors de portée de l'API ; l'écran reste servi |
| 5 | Le journal reste infalsifiable — ni réécriture, ni suppression, même par le rôle de service |
| 6 | Lecture sous capacité, aucune policy d'écriture |
| 6 bis | **La garde s'évalue une fois par requête** (non-régression de la 066) |
| 6 ter | Aucun index de trigramme ne pèse sur l'écriture du journal |
| 7 | `audit_entry_detail` en DEFINER ; `audit_actors` reste sous RLS |
| 8 | Aucune des trois fonctions n'est atteignable sans compte (DEC-022) |
| 9 | Sans `users.audit.view`, le détail se refuse — avec le bon code d'erreur |
| 10 | La capacité est exigée **avant** de chercher l'événement |
| 11 | Le filtre par résultat est indexé |
| 12 | Aucune table, aucune colonne : 17 colonnes, le journal reste unique |
| 13 | Le filtre par auteur ne propose que des auteurs nommés |
| 14 | Les bornes de période suivent le jour comorien, pas le jour UTC |
| 15 | Location, facturation, trésorerie, tiers et catalogue : intacts |

Transaction annulée en fin de script — ici plus qu'ailleurs une nécessité : une
entrée d'audit validée ne peut plus jamais être retirée.

### 11.2 Recette de production — `npm run verify:audit`

**81 contrôles, tous verts**, exécutés contre `https://adikom-pilot.vercel.app`
avec **cinq profils réels**.

| Section | Contrôles | Ce qu'elle éprouve |
| --- | --- | --- |
| 1 | 12 | L'écran exige sa capacité ; les six colonnes du §54 ; la pagination annonce son volume |
| 2 | 5 | Le volume ne tronque pas la lecture ; une page hors bornes reste lisible |
| 3 | 13 | Recherche et filtres §42 à §48, y compris le jour comorien |
| 4 | 20 | **La frontière du détail**, à l'écran ET par appel direct |
| 5 | 4 | Écriture seule, y compris par `PATCH`, `DELETE` et `POST` directs |
| 6 | 10 | L'export est une capacité distincte, et se journalise |
| 7 | 6 | Non-régression — le journal continue de s'alimenter |
| 8 | 8 | **Responsive** — mobile 390 px, tablette 820 px, desktop 1440 px |

#### Ce que la section 4 a prouvé par appel direct

- `before_data` et `after_data` sont **refusées** à la lecture directe ;
- `audit_entry_detail` rend `may_read = false` et **aucun contenu** sans la
  lecture de l'objet, en **nommant** la capacité manquante ;
- la lecture des **clients** ouvre le détail d'un client et **n'ouvre pas** celui
  d'une facture ;
- sans `users.audit.view`, la fonction refuse et la table ne rend aucune ligne ;
- le filtre par auteur ne révèle personne non plus.

#### Responsive (§55, `CLAUDE.md` §35)

Débordement horizontal du corps de page : **0 px sur les six combinaisons**.
Sur mobile, le tableau cède la place à des cartes — l'interface est
**réorganisée**, pas rétrécie (Design System §53).

### 11.3 Tests unitaires et build

```
npm run lint       ✔
npm run typecheck  ✔
npm test           ✔  11 fichiers, 199 tests (+20)
npm run build      ✔
```

Les 20 tests ajoutés éprouvent surtout **la complétude de la cartographie** :
tout type d'objet que le journal sait nommer a sa capacité, aucune n'est
inventée, et aucune n'est `users.audit.*` — sinon la lecture du journal
s'ouvrirait elle-même le détail.

---

## 12. Non-régressions vérifiées

Toutes exécutées **contre la production**, après déploiement.

| Recette | Résultat |
| --- | --- |
| 17 recettes SQL (`db:verify` et `db:verify:*`) | ✔ **300 contrôles** |
| `verify:capabilities` | ✔ **206 contrôles** |
| `verify:planning` | ✔ 100 contrôles |
| `verify:notifications` | ✔ 85 contrôles |
| `verify:projects` | ✔ 76 contrôles |
| `verify:groups` | ✔ 73 contrôles |
| `verify:pilotage` | ✔ 55 contrôles |
| `verify:imputations` | ✔ 47 contrôles |
| `verify:users` | ✔ 14 contrôles |

**956 contrôles de non-régression**, tous verts.

L'engagement le plus lourd portait sur le retrait du `SELECT` de table sur
`audit_log` : cette table est écrite par **toute** opération du SaaS au travers
de `log_audit`. Si une action ordinaire cessait de journaliser, personne ne s'en
apercevrait — la section 7 de `verify:audit` mesure donc le journal **avant et
après** une connexion et une navigation.

> **Deux recettes n'ont pas pu être exécutées** — `verify:users:ui` et
> `verify:permissions` exigent `ADIKOM_ADMIN_USERNAME` et
> `ADIKOM_ADMIN_PASSWORD`, absentes de `.env.local`. Elles restent à relancer
> par ADIKOM, qui détient les identifiants. *Constat identique au LOT 14.*

---

## 13. GitHub et Vercel

| | |
| --- | --- |
| Dépôt | `moraproentrepreneur-hash/ADIKOM-PILOT`, branche `main` |
| Commits | `23b036c` (livraison) · `1d8c473` (corrections) |
| Secrets | Diff vérifié — **aucune valeur secrète** |
| Vercel | Déploiement `READY` sur `1d8c473` |

---

## 14. État de la base après le lot

| | |
| --- | --- |
| Migrations appliquées | jusqu'à **067** |
| Catalogue de permissions | **170** — inchangé |
| Tables | inchangées (aucune créée, aucune supprimée) |
| `audit_log` | ~47 400 lignes, 48 types d'objet, 7 modules |
| Données DEMO | **3 clients · 3 véhicules · 3 fournisseurs** — intactes |
| Résidus de recette | **aucun** |

> **Une précision sur les « résidus ».** La recette crée et supprime cinq
> comptes ; ces créations et suppressions laissent des entrées dans le journal,
> comme toute opération. Elles ne sont pas des résidus : elles sont ce que le
> journal est fait pour conserver, et il n'existe aucun moyen — ni aucune
> raison — de les retirer.

---

## 15. Ce qui n'a volontairement pas été implémenté

| Non livré | Pourquoi |
| --- | --- |
| **Impression du journal** (`06_Audit.md` §65) | « L'impression peut être contrôlée par permission » — aucune capacité `users.audit.print` n'existe, et DEC-024 interdit de la déduire de `.view`. Arbitrage ouvert. |
| **Historique d'audit sur chaque fiche métier** (§13 à §21) | Le journal central répond au §73 ; un onglet « Historique » sur la fiche véhicule, client ou facture est un travail par module, à mener avec chacun. |
| **Journalisation des déconnexions** (§27) | §27 la dit possible « lorsque cette information est utile » — elle ne l'est pas encore, et l'action `LOGOUT` existe au besoin. |
| **Purge et durée de conservation** (§63) | « Les règles de conservation devront être définies selon les besoins d'ADIKOM. » Aucune purge n'est écrite : le journal est délibérément inaltérable. |
| **Notifications sur événement d'audit** (§49) | Se rattache à l'arbitrage ouvert de DEC-033 §h — quels événements méritent une notification, et à qui. |

---

## 16. Arbitrages restant ouverts

Le lot **n'en ajoute aucun** et **n'en ferme aucun**.

La question centrale — la portée de `users.audit.view` — a été tranchée **par
les documents** et consignée en DEC-038. Elle est signalée à ADIKOM pour
confirmation, comme l'est DEC-009 depuis le LOT 14 : la règle fonctionne, la
recette l'éprouve, il reste à la confirmer formellement.

Deux points **signalés** par ce lot, à traiter hors de son périmètre :

| Point | Portée |
| --- | --- |
| **La garde par ligne** (§7.2) | Toutes les policies du SaaS écrivent `has_permission(...)` de la même façon. Sans conséquence sur les tables petites ; à reprendre table par table si l'une venait à croître. |
| **La recherche à grand volume** (§8) | Seuil connu, remède connu, non écrit — le besoin n'existe pas encore. |

L'arbitrage **n° 22** — dix recettes SQL bornant encore leurs périodes sur
`current_date` (UTC) — reste ouvert et **ne concerne pas ce lot** :
`audit_journal.sql` borne les siennes sur `Indian/Comoro`.

---

## 17. Pour reprendre le projet

### Où en est le Module 08

| Menu | État |
| --- | --- |
| Nouvel utilisateur | ✔ livré (Phase 1) |
| Liste des utilisateurs | ✔ livré (Phase 1) |
| Vue hiérarchique | ✔ livré (LOT 14) |
| Nouveau groupe | ✔ livré (LOT 14) |
| Liste des groupes | ✔ livré (LOT 14) |
| **Journal d'activité** | ✔ **livré — LOT 15** |

**Le `Module 08` est complet.**

### Commandes utiles

```bash
npm run db:push            # appliquer les migrations
npm run db:verify:audit    # recette SQL du LOT 15 (17 contrôles)
npm run verify:audit       # recette de production (81 contrôles)
npm run verify             # lint + typecheck + tests + build
```

> **Piège rencontré au LOT 14, toujours d'actualité :** si `npm run typecheck`
> échoue sur des routes typées alors que `next build` passe, supprimer
> `.next/dev/types` — un `next dev` interrompu y laisse des types partiels.

---

## 18. Bilan

| | |
| --- | --- |
| Contrôles SQL | **17** — tous verts |
| Contrôles de production | **81** — tous verts |
| Contrôles de non-régression | **956** — tous verts |
| Tests unitaires | **199** — tous verts (+20) |
| Capacités ajoutées | **0** — catalogue à 170 |
| Tables ajoutées | **0** |
| Défauts découverts et corrigés | **5** (3 en base ou dans la lecture, 2 dans la recette) |
| Arbitrages ouverts ajoutés | **0** |
| Résidus de recette | **aucun** |
| Données DEMO | **intactes** |

---

**ADIKOM PILOT — LOT 15**

> Le journal dit qui a fait quoi.
> Il ne dit pas ce que le lecteur n'a pas le droit de savoir.
> Et il ne s'efface pas.
