# Rapport 23 — Clôture des LOT 27 et 28 · Point de vente

**8 octobre 2026 · ADIKOM PILOT · module 12 `pos`**

## 1. État final

| | |
| --- | --- |
| SHA applicatif déployé | **`cece003`** (fusion du LOT 28) — Vercel `READY`, production |
| LOT 27 déployé | `18d00b0` (validé en production avant le LOT 28) |
| Migrations | **122** (LOT 27 : 108–111 · LOT 28 : 112–120 · Q-10 : 121 · Q-13 : 122), toutes appliquées sur Supabase, `db:status` *up to date* |
| Catalogue de capacités | **246** (229 → 238 → 246) |
| Tables sauvegardées | **69** (62 → 65 → 69) |
| Tests unitaires | **454/454** |
| GitHub | `main` = `origin/main` ; branches `lot-27-caisses-sessions`, `lot-28-recuperation-cloud` conservées |
| Vercel O-1 | active — chaque push de branche : Preview `CANCELED` ; production seule construite |
| Décisions | DEC-054 et DEC-055 (dont Q-10, Q-13) **définitives** |
| Rapports | Rapport 21 et Rapport 22 **définitifs** |

## 2. Recettes réellement exécutées

| Périmètre | LOT 27 | LOT 28 |
| --- | --- | --- |
| Recette SQL du lot (Supabase réel, RLS sous `authenticated`) | 23/23 | **27/27** |
| Non-régression SQL ciblée (§47 bis) | 8 recettes ✅ | 14 recettes ✅ (trésorerie, facturation, règlements, sauvegarde, tableau de bord…) |
| Cycle réel sauvegarde → réinitialisation → restauration | ✅ 65 tables | ✅ **69 tables**, 221 lignes restaurées |
| Audit des capacités | 217/217 | 217/217 |
| Recettes navigateur (local) | 23/23 · responsive 519/519 | 22/22 · règlements clients 36/36 · fournisseurs 37/37 · coordonnées 32/32 · responsive 539/539 |
| **Production** | `verify:production` 56/56 · PDV 23/23 | `verify:production` 56/56 · ventes **22/22** · responsive **539/539** |

**Scénarios financiers critiques — vérifiés :** 60 000 dus, 100 000 remis → 40 000 de monnaie et
**60 000** en trésorerie (SQL et production) ; facture sur demande **sans mouvement** ; paiement
mixte réparti par compte, une écriture par paiement (SQL) ; règlement adossé fictif ou en double
**refusé** ; annulation motivée, rien d'effacé, interdite si facturée ; coûts jamais lus par le
caissier ni par `pos.sales.view` ; reçu A4 sans coût.

**Résidus :** toutes les recettes ont démonté leurs sujets et vérifié l'absence de résidu ;
données DEMO intactes. Trois interruptions **réseau** (502 Supabase, lecture vide) ont été
rejouées ; aucun échec fonctionnel n'a été masqué.

## 3. Dettes restantes

1. Écrans de Q-10 (client choisi à la facture) et de Q-13 (valorisation) : éprouvés en base, **non
   rejoués au navigateur** ; paiement mixte prouvé par SQL, pas par l'écran.
2. Choix restrictifs en vigueur jusqu'à décision : Q-1 à Q-6 (LOT 27), Q-7 à Q-9, Q-11, Q-12,
   Q-14, Q-15 (LOT 28).
3. Pas d'avoirs : une vente facturée ne s'annule pas (B-10).
4. `analytics.sql` §10 suppose qu'aucune facture n'est datée du jour (fragile, vert aujourd'hui).
5. Supabase CLI 2.115 (2.120 disponible).

## 4. Domaine officiel `adikompilot.adikom2t.com` — à préparer, rien n'est modifié

1. **Vercel** → projet `adikom-pilot` → *Settings → Domains* → ajouter
   `adikompilot.adikom2t.com`, rattaché à l'environnement **Production** (branche `main`).
   Garder `adikom-pilot.vercel.app` : il reste l'adresse de secours.
2. **DNS** de `adikom2t.com` (chez son registraire) : un enregistrement
   **`CNAME`** — nom **`adikompilot`** — valeur **`cname.vercel-dns.com`** (ou la valeur
   propre au projet que Vercel affiche à l'ajout ; c'est elle qui fait foi). TTL par défaut.
   Si le domaine porte un enregistrement **CAA**, autoriser `letsencrypt.org`.
3. Vercel émet le certificat HTTPS automatiquement une fois le DNS propagé.
4. **Application** : aucune modification — le code n'écrit aucune URL d'application et
   n'utilise aucune redirection d'authentification. Par cohérence, on pourra renseigner le
   domaine dans Supabase → *Authentication → URL Configuration* (Site URL), sans effet sur
   la connexion actuelle.
5. Après bascule : `npm run verify:production -- https://adikompilot.adikom2t.com`.

---

**LOT 27 ET LOT 28 — VALIDÉS ET DÉPLOYÉS À `cece003`.**
