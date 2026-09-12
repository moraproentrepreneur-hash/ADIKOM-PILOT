-- =============================================================================
-- ADIKOM PILOT — 079 · Réinitialisation du mot de passe d'un utilisateur
-- LOT 19 — DEC-046
--
-- CE QUI EXISTE, ET QUI NE BOUGE PAS
--
-- Le mécanisme du mot de passe temporaire est validé par le demandeur. Il reste
-- entier :
--
--   1. `generateTemporaryPassword()` — 16 caractères, `crypto.getRandomValues`,
--      exécuté DANS LE NAVIGATEUR de l'administrateur ;
--   2. `must_change_password` levé sur la fiche ;
--   3. `requireUser()` détourne vers l'écran de changement tant qu'il l'est ;
--   4. `changePasswordAction` lève l'indicateur, jamais l'utilisateur lui-même
--      (`fn_prevent_self_promotion`).
--
-- Cette migration n'ajoute AUCUN mécanisme de mot de passe. Elle ajoute
-- l'orchestration qui permet de REJOUER celui-là après la création du compte.
--
-- CE QUI EST GARDABLE, ET CE QUI NE L'EST PAS
--
-- L'écriture du mot de passe dans Supabase Auth exige la clé de service : elle
-- ne peut pas, par nature, être gardée par RLS. La garde en base porte donc sur
-- ce qui est gardable — L'INDICATEUR et LE JOURNAL.
--
-- Or `app_users_update` (migration 006) ouvre l'écriture à
-- `users.users.update`. S'en contenter rendrait la réinitialisation
-- IMPLICITEMENT INCLUSE dans « modifier un utilisateur », ce que DEC-024
-- interdit. D'où les trois pièces de cette migration :
--
--   1. la capacité `users.users.password.reset` ;
--   2. une policy dédiée `app_users_password_reset`, gardée par elle seule ;
--   3. un déclencheur qui, par cette voie, refuse toute écriture portant sur une
--      autre colonne que `must_change_password` — RLS étant ROW-level, la policy
--      ouvrirait sinon la ligne entière : nom, email, statut, rôle Super Admin.
--
-- La forme du déclencheur est celle de `fn_prevent_self_promotion`, qui
-- restreint déjà des COLONNES. Aucune fonction métier `SECURITY DEFINER` n'est
-- créée (doctrine D4).
--
-- LE MOT DE PASSE N'APPARAÎT NULLE PART ICI
--
-- Aucune colonne d'`app_users` ne le contient, aucun paramètre de fonction ne le
-- transporte, et le journal n'en reçoit ni la valeur ni l'empreinte. La base ne
-- sait jamais quel mot de passe a été remis — elle sait qu'il doit être changé.
--
-- Catalogue : 178 → 179.
-- =============================================================================


-- =============================================================================
-- 1. LA CAPACITÉ
--
-- La liste de colonnes ouvre par `(code, module_code` : c'est la forme que le
-- contrôle de parité TS/SQL (`permissions.test.ts`) reconnaît pour rejouer le
-- catalogue sans interpréter du SQL.
--
-- `ADMIN` et non `UPDATE` : le précédent est `rental.pricing.override`
-- (« Forcer un tarif manuellement »). Réinitialiser ne modifie pas une donnée de
-- la fiche, c'est un acte d'administration sur un compte.
--
-- SENSIBLE : cet acte rend un accès.
-- =============================================================================

with nouvelles (
  code, module_code, menu_code, submenu_code, submenu_label, action, label, rang
) as (values
  ('users.users.password.reset', 'users', 'users', 'password', 'Mot de passe',
   'ADMIN', 'Réinitialiser le mot de passe', 1)
)
insert into public.permissions (
  code, module_code, module_label, menu_code, menu_label,
  submenu_code, submenu_label, action, label, is_sensitive,
  module_order, menu_order, submenu_order, action_order
)
select
  n.code,
  n.module_code,
  ref.module_label,
  n.menu_code,
  ref.menu_label,
  n.submenu_code,
  n.submenu_label,
  n.action::public.permission_action,
  n.label,
  true,
  ref.module_order,
  ref.menu_order,
  ref.last_order + n.rang,
  9                                    -- ADMIN, comme `rental.pricing.override`
from nouvelles n
join lateral (
  select
    p.module_label,
    p.menu_label,
    p.module_order,
    p.menu_order,
    max(p.submenu_order) over () as last_order
  from public.permissions p
  where p.module_code = n.module_code
    and p.menu_code   = n.menu_code
  limit 1
) ref on true
on conflict (code) do update set
  module_label  = excluded.module_label,
  menu_label    = excluded.menu_label,
  submenu_code  = excluded.submenu_code,
  submenu_label = excluded.submenu_label,
  label         = excluded.label,
  is_sensitive  = excluded.is_sensitive,
  module_order  = excluded.module_order,
  menu_order    = excluded.menu_order,
  submenu_order = excluded.submenu_order,
  action_order  = excluded.action_order;


-- =============================================================================
-- 2. LA POLICY DÉDIÉE
--
-- Elle ouvre l'écriture d'`app_users` au porteur de la seule capacité de
-- réinitialisation. Les policies permissives se cumulent : le porteur de
-- `users.users.update` conserve la sienne, inchangée.
--
-- `has_permission(...)` est enveloppée dans un sous-select : une garde de RLS
-- s'évalue PAR LIGNE, et l'appel coûterait sinon un aller-retour par ligne de la
-- table. Le sous-select le ramène à un (migration 065).
--
-- CE QUE CETTE POLICY N'OUVRE PAS : rien d'autre que l'indicateur. RLS est
-- ROW-level ; c'est le déclencheur de la section 3 qui tient les colonnes.
-- =============================================================================

drop policy if exists app_users_password_reset on public.app_users;

create policy app_users_password_reset on public.app_users
  for update
  to authenticated
  using       ((select public.has_permission('users.users.password.reset')))
  with check  ((select public.has_permission('users.users.password.reset')));

comment on policy app_users_password_reset on public.app_users is
  'Réinitialisation du mot de passe : ouvre l''écriture à `users.users.password.reset` seule. Les colonnes sont tenues par fn_password_reset_guard.';


-- =============================================================================
-- 3. LE DÉCLENCHEUR — DEUX RÈGLES DISTINCTES
--
-- A. LEVER L'INDICATEUR EST LA RÉINITIALISATION.
--    Quiconque le lève doit détenir `users.users.password.reset`, et subir les
--    trois refus de sécurité — y compris s'il détient par ailleurs
--    `users.users.update`. DEC-024 : une capacité n'en ouvre pas une autre.
--
-- B. LE PORTEUR DE LA SEULE CAPACITÉ DE RÉINITIALISATION NE TOUCHE RIEN D'AUTRE.
--    Ni le nom, ni l'email, ni le téléphone, ni la fonction, ni le responsable,
--    ni le statut, ni le rôle Super Admin.
--
-- L'ORDRE DES CONTRÔLES DANS LA RÈGLE A N'EST PAS INDIFFÉRENT.
--
-- Le refus du compte ARCHIVED est une règle de COHÉRENCE : elle vaut pour tout
-- acteur, la clé de service comprise. Elle est donc posée AVANT la distinction
-- d'acteur — placer `current_actor() is null` en tête l'effacerait pour la clé
-- de service, comme un défaut précédent l'a montré (migration 055).
--
-- Les deux autres refus sont, eux, relatifs à l'acteur : il n'y a pas de « son
-- propre compte » sans acteur.
-- =============================================================================

create or replace function public.fn_password_reset_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_actor();
begin
  /* ---------------------------------------------------------------------- */
  /*  A. L'acte de réinitialisation                                          */
  /* ---------------------------------------------------------------------- */
  if coalesce(new.must_change_password, false)
     and not coalesce(old.must_change_password, false) then

    -- Cohérence, pour tout acteur : on réactive avant de rendre un accès.
    if old.status = 'ARCHIVED' then
      raise exception
        'Opération refusée : le mot de passe d''un compte archivé ne se réinitialise pas. Réactivez le compte d''abord.'
        using errcode = 'check_violation';
    end if;

    if v_actor is not null then
      -- L'écran de changement existe déjà : cette voie n'a pas à le doubler, et
      -- le journal resterait ambigu sur l'auteur réel de l'opération.
      if v_actor = old.id then
        raise exception
          'Opération refusée : cette voie ne réinitialise pas le mot de passe de son propre compte.'
          using errcode = 'insufficient_privilege';
      end if;

      -- SANS CE REFUS, LA CAPACITÉ DEVIENT UN CHEMIN DE PRISE DE CONTRÔLE :
      -- qui réinitialise le mot de passe du Super Admin se connecte à sa place,
      -- et s'attribue ensuite tout le reste.
      if old.is_super_admin and not public.is_super_admin() then
        raise exception
          'Opération refusée : seul un Super Admin peut réinitialiser le mot de passe d''un Super Admin.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    -- Deuxième barrière, après l'action serveur : la policy dit qui peut écrire
    -- dans la table, ceci dit qui peut accomplir CET acte. Sans effet lorsque
    -- aucune session applicative n'est en cause (clé de service, migration).
    perform public.require_capability(
      array['users.users.password.reset'],
      'réinitialiser le mot de passe d''un utilisateur'
    );
  end if;

  /* ---------------------------------------------------------------------- */
  /*  B. La portée de l'écriture                                             */
  /*                                                                         */
  /*  `updated_at` et `updated_by` sont exclus de la comparaison : ils sont   */
  /*  posés par `fn_set_updated_at`, et ne sont pas une donnée du compte.     */
  /* ---------------------------------------------------------------------- */
  if v_actor is not null
     and not public.has_permission('users.users.update')
     and (to_jsonb(new) - 'must_change_password' - 'updated_at' - 'updated_by')
         is distinct from
         (to_jsonb(old) - 'must_change_password' - 'updated_at' - 'updated_by')
  then
    raise exception
      'Opération refusée : la réinitialisation du mot de passe ne modifie aucune autre donnée du compte.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.fn_password_reset_guard() is
  'Lever must_change_password exige `users.users.password.reset` et subit les trois refus ; le porteur de cette seule capacité ne modifie aucune autre colonne.';

drop trigger if exists app_users_password_reset_guard on public.app_users;

create trigger app_users_password_reset_guard
  before update on public.app_users
  for each row execute function public.fn_password_reset_guard();


-- =============================================================================
-- 4. L'ACTE — `require_password_reset(p_user_id)`
--
-- `security invoker` (défaut) : l'écriture passe par les policies de l'appelant.
-- `require_capability` est la PREMIÈRE instruction.
--
-- POURQUOI `users.users.view` EST EXIGÉE
--
-- Un `UPDATE` sous RLS LIT les lignes qu'il vise. Sans droit de lecture sur
-- `app_users`, l'`UPDATE` ne modifierait rien — et ne dirait rien : zéro ligne
-- touchée, aucune erreur. La capacité de lecture est donc exigée explicitement,
-- puis L'EFFET est vérifié, plutôt que supposé.
--
-- POURQUOI L'INDICATEUR AVANT LE MOT DE PASSE
--
-- L'appelant écrit ensuite le mot de passe dans Supabase Auth. Si CETTE seconde
-- étape échoue, l'utilisateur garde son ancien mot de passe mais devra le
-- changer : dégradé, sûr, réessayable. L'ordre inverse produirait un temporaire
-- SANS obligation de le changer — donc un mot de passe définitif connu de
-- l'administrateur. Inacceptable.
--
-- CE QUE LE JOURNAL REÇOIT
--
-- Qui, sur qui, quand, et que l'opération a eu lieu. JAMAIS le mot de passe, ni
-- son empreinte, ni aucune valeur permettant de le retrouver. L'entrée est
-- explicite : sans elle, une réinitialisation portant sur un compte DÉJÀ en
-- attente de changement ne laisserait aucune trace, le déclencheur d'audit ne
-- journalisant que les écritures qui modifient réellement une donnée.
-- =============================================================================

create or replace function public.require_password_reset(p_user_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  u public.app_users%rowtype;
begin
  perform public.require_capability(
    array['users.users.password.reset'],
    'réinitialiser le mot de passe d''un utilisateur'
  );
  perform public.require_capability(
    array['users.users.view'],
    'consulter la fiche de l''utilisateur concerné'
  );

  select * into u from public.app_users where id = p_user_id;

  if not found then
    raise exception 'Utilisateur introuvable.' using errcode = 'no_data_found';
  end if;

  -- Les trois refus sont également opposés par le déclencheur, donc sur appel
  -- direct. Ils sont répétés ici pour rendre un motif exact plutôt qu'une
  -- erreur technique.
  if u.id = public.current_actor() then
    raise exception
      'Opération refusée : cette voie ne réinitialise pas le mot de passe de son propre compte.'
      using errcode = 'insufficient_privilege';
  end if;

  if u.is_super_admin and not public.is_super_admin() then
    raise exception
      'Opération refusée : seul un Super Admin peut réinitialiser le mot de passe d''un Super Admin.'
      using errcode = 'insufficient_privilege';
  end if;

  if u.status = 'ARCHIVED' then
    raise exception
      'Opération refusée : le mot de passe d''un compte archivé ne se réinitialise pas. Réactivez le compte d''abord.'
      using errcode = 'check_violation';
  end if;

  update public.app_users
     set must_change_password = true
   where id = p_user_id;

  -- L'EFFET, pas l'intention : une policy manquante rendrait zéro ligne sans
  -- lever d'erreur, et l'appelant croirait l'opération faite.
  if not found then
    raise exception
      'Opération refusée : le changement de mot de passe obligatoire n''a pas pu être imposé.'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.log_audit(
    p_action      => 'UPDATE',
    p_entity_type => 'app_users',
    p_entity_id   => p_user_id::text,
    p_entity_label=> u.first_name || ' ' || u.last_name,
    p_module_code => 'users',
    p_reason      => 'Réinitialisation du mot de passe par un administrateur autorisé. Un mot de passe temporaire a été remis ; son titulaire devra le remplacer à sa prochaine connexion.'
  );
end;
$$;

comment on function public.require_password_reset(uuid) is
  'Impose le changement de mot de passe à un utilisateur et journalise l''acte. Ne connaît aucun mot de passe : l''écriture dans Supabase Auth appartient à l''appelant.';

revoke all on function public.require_password_reset(uuid) from public;
grant execute on function public.require_password_reset(uuid) to authenticated, service_role;


-- =============================================================================
-- 5. CONTRÔLES DE NON-RÉGRESSION
--
-- LE TOTAL DU CATALOGUE EST AFFIRMÉ ICI, ET NULLE PART AILLEURS.
--
-- Il l'était dans 35 fichiers de recette : chaque capacité ajoutée faisait donc
-- tomber 35 recettes pour une raison sans rapport avec ce qu'elles éprouvent.
-- Une migration, elle, énonce un fait DATÉ — le total au moment où elle
-- s'applique — et n'a jamais à être rouverte. Les recettes portent désormais la
-- présence nominative des codes qu'elles éprouvent, et la variation du
-- catalogue pendant leur propre passage.
-- =============================================================================

do $$
declare
  v_total int;
  v_row   public.permissions%rowtype;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 179 then
    raise exception 'Catalogue attendu à 179 permissions, obtenu %.', v_total;
  end if;

  select * into v_row from public.permissions where code = 'users.users.password.reset';

  if not found then
    raise exception 'La capacité `users.users.password.reset` est absente du catalogue.';
  end if;

  if v_row.action <> 'ADMIN' then
    raise exception 'La capacité de réinitialisation doit porter l''action ADMIN, obtenu %.', v_row.action;
  end if;

  if v_row.is_sensitive is not true then
    raise exception 'La capacité de réinitialisation doit être sensible : elle rend un accès.';
  end if;

  if v_row.submenu_code <> 'password' then
    raise exception 'La capacité de réinitialisation doit vivre sous le sous-menu `password`, obtenu %.',
      coalesce(v_row.submenu_code, '(aucun)');
  end if;

  -- Ce qui n'existe pas, et ne doit pas exister : le SaaS ne propose ni l'envoi
  -- d'un lien, ni la lecture d'un mot de passe (CLAUDE.md §19 bis).
  if exists (
    select 1 from public.permissions
    where code in (
      'users.users.password.view', 'users.users.password.send',
      'users.users.password.update', 'users.users.password.generate'
    )
  ) then
    raise exception 'Une capacité a été créée pour une fonctionnalité que le lot ne livre pas.';
  end if;

  -- La policy et le déclencheur, sans lesquels la capacité ne garderait rien.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_users'
      and policyname = 'app_users_password_reset'
  ) then
    raise exception 'La policy `app_users_password_reset` est absente.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.app_users'::regclass
      and tgname  = 'app_users_password_reset_guard'
      and not tgisinternal
  ) then
    raise exception 'Le déclencheur `app_users_password_reset_guard` est absent.';
  end if;

  -- DOCTRINE D4 : aucune fonction métier `SECURITY DEFINER`.
  if exists (
    select 1 from pg_proc
    where oid = 'public.require_password_reset(uuid)'::regprocedure
      and prosecdef
  ) then
    raise exception '`require_password_reset` ne doit pas être SECURITY DEFINER.';
  end if;

  -- Aucune colonne de mot de passe n'apparaît sur la fiche, et n'y apparaîtra.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users'
      and column_name ~* 'password'
      and column_name <> 'must_change_password'
  ) then
    raise exception 'Une colonne de mot de passe est apparue sur `app_users`.';
  end if;

  raise notice '[OK] 079. Catalogue à 179 ; réinitialisation gardée par capacité, policy et déclencheur.';
end $$;
