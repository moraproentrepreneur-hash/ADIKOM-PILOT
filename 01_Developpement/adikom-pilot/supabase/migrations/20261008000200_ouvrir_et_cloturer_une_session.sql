-- =============================================================================
-- ADIKOM PILOT — 109 · Déclarer une caisse, ouvrir et clôturer une session
-- LOT 27 — Plan 02 §7.5, §8.1 (D1), §8.3 · Plan 01 §16.9–16.13 · Module 12
--
-- LES ACTES
--
--   create_pos_register(label, account, location)          → uuid
--   update_pos_register(register, label, account, location)
--   set_pos_register_active(register, active, reason)
--   open_pos_session(register, opening_float)              → uuid
--   close_pos_session(session, counted_amount, note)
--
-- LES DÉRIVÉS — D1 : RIEN N'EST STOCKÉ
--
--   pos_session_expected(session)  → théorique = fond de caisse (LOT 27)
--   pos_session_variance(session)  → écart = compté − théorique
--   pos_sessions_in_window(début, fin, caisse?, caissier?)
--                                  → « qui était en caisse entre 10h00 et 11h30 ? »
--
-- RÈGLES INVARIABLES (Plan 02 §8.3)
--
--   1. `security invoker`, `set search_path = public, pg_temp` ;
--   2. `require_capability` en tête ;
--   3. `revoke … from public, anon` puis `grant … to authenticated, service_role` ;
--   4. la cohérence AVANT l'acteur : `require_capability` laisse passer la clé de
--      service, les contrôles métier, eux, s'appliquent à tous ;
--   5. une garde qui compte doit compter la vérité : chaque acte qui LIT pour
--      décider exige la capacité de lire ce qu'il lit (migrations 054, 063).
--
-- 🟥 AUCUNE FONCTION `SECURITY DEFINER`.
-- =============================================================================


-- =============================================================================
-- 1. DÉCLARER UNE CAISSE
-- =============================================================================

create or replace function public.create_pos_register(
  p_label      text,
  p_account_id uuid,
  p_location   text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_no     text;
  v_label  text := nullif(btrim(coalesce(p_label, '')), '');
  v_kind   public.financial_account_kind;
  v_status public.financial_account_status;
  v_seen   boolean := false;
begin
  perform public.require_capability(array['pos.registers.create'], 'déclarer une caisse');
  perform public.require_capability(array['pos.registers.view'], 'consulter la caisse déclarée');
  -- On n'adosse pas une caisse à un compte qu'on ne peut pas consulter.
  perform public.require_capability(array['treasury.accounts.view'], 'consulter le compte adossé à la caisse');

  if v_label is null then
    raise exception 'Une caisse doit être nommée.' using errcode = 'check_violation';
  end if;

  if p_account_id is null then
    raise exception 'Une caisse s''adosse obligatoirement à un compte de type Caisse.'
      using errcode = 'check_violation';
  end if;

  select true, a.kind, a.status into v_seen, v_kind, v_status
  from public.financial_accounts a where a.id = p_account_id;

  if not coalesce(v_seen, false) then
    raise exception 'Le compte adossé à la caisse est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;
  if v_kind <> 'CASH' then
    raise exception 'Opération refusée : une caisse s''adosse obligatoirement à un compte de type Caisse, jamais à un compte bancaire.'
      using errcode = 'check_violation';
  end if;
  if v_status <> 'ACTIVE' then
    raise exception 'Opération refusée : le compte adossé n''est pas actif.'
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('pos_register');

  perform set_config('adikom.pos_register', 'on', true);

  insert into public.pos_registers
    (register_no, label, account_id, account_kind, location, created_by, updated_by)
  values
    (v_no, v_label, p_account_id, 'CASH', nullif(btrim(coalesce(p_location, '')), ''),
     public.current_actor(), public.current_actor())
  returning id into v_id;

  perform set_config('adikom.pos_register', 'off', true);

  return v_id;
end;
$$;

comment on function public.create_pos_register(text, uuid, text) is
  'Déclare une caisse, adossée à un compte CASH actif. Seul chemin de création : le numéroteur CAI ne se contourne pas.';

revoke execute on function public.create_pos_register(text, uuid, text) from public, anon;
grant  execute on function public.create_pos_register(text, uuid, text) to authenticated, service_role;


-- =============================================================================
-- 2. MODIFIER UNE CAISSE
--
-- 🟥 CHANGER DE COMPTE PENDANT UNE SESSION OUVERTE EST REFUSÉ (Module 12 §11,
-- Q-3) : la session a été ouverte sur un compte ; les encaissements du LOT 28
-- doivent atterrir dans celui-là. Pour COMPTER les sessions ouvertes, l'acte
-- exige de pouvoir les lire.
-- =============================================================================

create or replace function public.update_pos_register(
  p_register_id uuid,
  p_label       text,
  p_account_id  uuid,
  p_location    text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_label   text := nullif(btrim(coalesce(p_label, '')), '');
  v_current uuid;
  v_seen    boolean := false;
begin
  perform public.require_capability(array['pos.registers.update'], 'modifier une caisse');
  perform public.require_capability(array['pos.registers.view'], 'consulter la caisse modifiée');

  if v_label is null then
    raise exception 'Une caisse doit être nommée.' using errcode = 'check_violation';
  end if;
  if p_account_id is null then
    raise exception 'Une caisse s''adosse obligatoirement à un compte de type Caisse.'
      using errcode = 'check_violation';
  end if;

  select true, r.account_id into v_seen, v_current
  from public.pos_registers r where r.id = p_register_id;

  if not coalesce(v_seen, false) then
    raise exception 'Caisse introuvable ou non lisible avec vos droits.' using errcode = 'no_data_found';
  end if;

  if p_account_id is distinct from v_current then
    perform public.require_capability(array['treasury.accounts.view'], 'consulter le nouveau compte adossé');
    perform public.require_capability(array['pos.sessions.view'], 'vérifier qu''aucune session n''est ouverte sur la caisse');

    if exists (
      select 1 from public.pos_sessions s
      where s.register_id = p_register_id and s.status = 'OPEN'
    ) then
      raise exception 'Opération refusée : une session est ouverte sur cette caisse. Son compte ne change qu''une fois la session close.'
        using errcode = 'check_violation';
    end if;
  end if;

  perform set_config('adikom.pos_register', 'on', true);

  update public.pos_registers
     set label      = v_label,
         account_id = p_account_id,
         location   = nullif(btrim(coalesce(p_location, '')), '')
   where id = p_register_id;

  perform set_config('adikom.pos_register', 'off', true);
end;
$$;

comment on function public.update_pos_register(uuid, text, uuid, text) is
  'Modifie le libellé, le lieu ou le compte adossé d''une caisse. Le compte ne change pas pendant une session ouverte.';

revoke execute on function public.update_pos_register(uuid, text, uuid, text) from public, anon;
grant  execute on function public.update_pos_register(uuid, text, uuid, text) to authenticated, service_role;


-- =============================================================================
-- 3. DÉSACTIVER / RÉACTIVER UNE CAISSE
-- =============================================================================

create or replace function public.set_pos_register_active(
  p_register_id uuid,
  p_active      boolean,
  p_reason      text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_seen    boolean := false;
  v_current boolean;
begin
  perform public.require_capability(array['pos.registers.archive'], 'désactiver ou réactiver une caisse');
  perform public.require_capability(array['pos.registers.view'], 'consulter la caisse');

  if p_active is null then
    raise exception 'Indiquez si la caisse est active.' using errcode = 'check_violation';
  end if;

  select true, r.is_active into v_seen, v_current
  from public.pos_registers r where r.id = p_register_id;

  if not coalesce(v_seen, false) then
    raise exception 'Caisse introuvable ou non lisible avec vos droits.' using errcode = 'no_data_found';
  end if;

  if v_current = p_active then
    return;  -- rien à faire : ni écriture, ni journal
  end if;

  if not p_active then
    perform public.require_capability(array['pos.sessions.view'], 'vérifier qu''aucune session n''est ouverte sur la caisse');

    if exists (
      select 1 from public.pos_sessions s
      where s.register_id = p_register_id and s.status = 'OPEN'
    ) then
      raise exception 'Opération refusée : une session est ouverte sur cette caisse. Clôturez-la avant de désactiver la caisse.'
        using errcode = 'check_violation';
    end if;
  else
    -- La garde relit le compte : il doit être actif pour rouvrir la caisse.
    perform public.require_capability(array['treasury.accounts.view'], 'vérifier le compte adossé');
  end if;

  perform set_config('adikom.pos_register', 'on', true);

  update public.pos_registers
     set is_active         = p_active,
         status_reason     = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = public.current_actor()
   where id = p_register_id;

  perform set_config('adikom.pos_register', 'off', true);
end;
$$;

comment on function public.set_pos_register_active(uuid, boolean, text) is
  'Désactive (refusé si une session est ouverte) ou réactive (compte adossé actif exigé) une caisse. Rien ne s''efface.';

revoke execute on function public.set_pos_register_active(uuid, boolean, text) from public, anon;
grant  execute on function public.set_pos_register_active(uuid, boolean, text) to authenticated, service_role;


-- =============================================================================
-- 4. OUVRIR UNE SESSION
--
-- Le caissier est l'utilisateur qui ouvre (B-8 : il ne peut en tenir qu'une).
--
-- 🟥 Q-1 — `treasury.accounts.view` EST EXIGÉE. La garde « compte actif » doit
-- lire la vérité, et elle ne le peut, sans `SECURITY DEFINER`, qu'avec la
-- lecture des comptes. Le LOT 28, qui écrira dans ce compte, l'exigera de toute
-- façon. Choix technique signalé au Rapport 21 — non une règle métier.
-- =============================================================================

create or replace function public.open_pos_session(
  p_register_id   uuid,
  p_opening_float bigint
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := public.current_actor();
  v_seen     boolean := false;
  v_active   boolean;
  v_account  uuid;
  v_label    text;
  v_kind     public.financial_account_kind;
  v_status   public.financial_account_status;
  v_id       uuid;
  v_no       text;
begin
  perform public.require_capability(array['pos.sessions.open'], 'ouvrir une session de caisse');
  perform public.require_capability(array['pos.sessions.view'], 'consulter la session ouverte');
  perform public.require_capability(array['pos.registers.view'], 'consulter la caisse');
  perform public.require_capability(array['treasury.accounts.view'], 'vérifier le compte adossé à la caisse');

  -- --- Cohérence, pour TOUT acteur ---------------------------------------------
  if p_opening_float is null then
    raise exception 'Le fond de caisse est obligatoire à l''ouverture (0 s''il n''y en a pas).'
      using errcode = 'check_violation';
  end if;
  if p_opening_float < 0 then
    raise exception 'Le fond de caisse ne peut pas être négatif.' using errcode = 'check_violation';
  end if;

  select true, r.is_active, r.account_id, r.label into v_seen, v_active, v_account, v_label
  from public.pos_registers r where r.id = p_register_id;

  if not coalesce(v_seen, false) then
    raise exception 'Caisse introuvable ou non lisible avec vos droits.' using errcode = 'no_data_found';
  end if;
  if not v_active then
    raise exception 'Opération refusée : la caisse « % » est inactive. Elle n''accepte aucune nouvelle session.', v_label
      using errcode = 'check_violation';
  end if;

  v_seen := false;
  select true, a.kind, a.status into v_seen, v_kind, v_status
  from public.financial_accounts a where a.id = v_account;

  if not coalesce(v_seen, false) then
    raise exception 'Le compte adossé à la caisse est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;
  if v_kind <> 'CASH' or v_status <> 'ACTIVE' then
    raise exception 'Opération refusée : le compte adossé à la caisse « % » n''est pas un compte de caisse actif.', v_label
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.pos_sessions s
             where s.register_id = p_register_id and s.status = 'OPEN') then
    raise exception 'Opération refusée : une session est déjà ouverte sur la caisse « % ». Une caisse n''a qu''une session ouverte à la fois.', v_label
      using errcode = 'check_violation';
  end if;

  -- --- L'acteur ----------------------------------------------------------------
  if v_actor is null then
    raise exception 'Une session s''ouvre au nom d''un utilisateur authentifié : elle n''a pas de caissier hors session applicative.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.pos_sessions s
             where s.cashier_id = v_actor and s.status = 'OPEN') then
    raise exception 'Opération refusée : vous tenez déjà une session ouverte. Un utilisateur ne tient qu''une session à la fois (B-8).'
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('pos_session');

  perform set_config('adikom.pos_session', 'on', true);

  insert into public.pos_sessions (session_no, register_id, cashier_id, created_by, updated_by)
  values (v_no, p_register_id, v_actor, v_actor, v_actor)
  returning id into v_id;

  insert into public.pos_session_amounts (session_id, cashier_id, opening_float, created_by, updated_by)
  values (v_id, v_actor, p_opening_float, v_actor, v_actor);

  perform set_config('adikom.pos_session', 'off', true);

  return v_id;
end;
$$;

comment on function public.open_pos_session(uuid, bigint) is
  'Ouvre une session au nom de l''appelant, avec son fond de caisse. Caisse active, compte CASH actif, une session ouverte par caisse et par utilisateur (B-8).';

revoke execute on function public.open_pos_session(uuid, bigint) from public, anon;
grant  execute on function public.open_pos_session(uuid, bigint) to authenticated, service_role;


-- =============================================================================
-- 5. CLÔTURER UNE SESSION
--
-- 🟥 B-9 — le montant compté est OBLIGATOIRE ; l'écart ne BLOQUE PAS et ne
-- MOUVEMENTE PAS la trésorerie. Il est constaté, affiché, journalisé.
--
-- Q-2 — clôturer la session D'UN AUTRE suppose `pos.sessions.amounts.view` :
-- compter une caisse et voir son écart, c'est en lire les montants.
-- =============================================================================

create or replace function public.close_pos_session(
  p_session_id     uuid,
  p_counted_amount bigint,
  p_note           text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid := public.current_actor();
  v_seen    boolean := false;
  v_status  public.pos_session_status;
  v_cashier uuid;
  v_no      text;
begin
  perform public.require_capability(array['pos.sessions.close'], 'clôturer une session de caisse');
  perform public.require_capability(array['pos.sessions.view'], 'consulter la session');

  if p_counted_amount is null then
    raise exception 'Le montant compté est obligatoire pour clôturer une session.'
      using errcode = 'check_violation';
  end if;
  if p_counted_amount < 0 then
    raise exception 'Le montant compté ne peut pas être négatif.' using errcode = 'check_violation';
  end if;

  select true, s.status, s.cashier_id, s.session_no into v_seen, v_status, v_cashier, v_no
  from public.pos_sessions s where s.id = p_session_id;

  if not coalesce(v_seen, false) then
    raise exception 'Session introuvable ou non lisible avec vos droits.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'OPEN' then
    raise exception 'Opération refusée : la session % est déjà close. Une session close ne se rouvre pas.', v_no
      using errcode = 'check_violation';
  end if;

  if v_actor is not null and v_cashier <> v_actor then
    perform public.require_capability(
      array['pos.sessions.amounts.view'],
      'clôturer la session d''un autre caissier — compter sa caisse, c''est en voir les montants');
  end if;

  perform set_config('adikom.pos_session', 'on', true);

  update public.pos_session_amounts
     set counted_amount = p_counted_amount
   where session_id = p_session_id;

  if not found then
    -- Invisible sous RLS : la mise à jour n'aurait rien fait, et l'aurait tu.
    raise exception 'Les montants de cette session ne sont pas lisibles avec vos droits.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.pos_sessions
     set status       = 'CLOSED',
         closed_at    = now(),
         closed_by    = v_actor,
         closing_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_session_id;

  perform set_config('adikom.pos_session', 'off', true);
end;
$$;

comment on function public.close_pos_session(uuid, bigint, text) is
  'Clôt une session avec son montant compté (obligatoire). L''écart est constaté et journalisé, jamais bloquant, sans écriture de trésorerie (B-9). Une session close ne se rouvre pas.';

revoke execute on function public.close_pos_session(uuid, bigint, text) from public, anon;
grant  execute on function public.close_pos_session(uuid, bigint, text) to authenticated, service_role;


-- =============================================================================
-- 6. LES DÉRIVÉS — D1
--
-- Sous les droits de l'appelant. Qui ne peut pas lire les montants obtient
-- NULL — jamais 0 (DEC-017) : la policy par ligne (B-13) décide, et les
-- fonctions n'ouvrent rien qu'elle fermerait.
--
-- LOT 28 : `pos_session_expected` s'enrichira des encaissements en ESPÈCES de la
-- session. Sa signature ne changera pas.
-- =============================================================================

create or replace function public.pos_session_expected(p_session_id uuid)
returns bigint
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_float bigint;
begin
  perform public.require_capability(array['pos.sessions.view'], 'consulter une session de caisse');

  select a.opening_float into v_float
  from public.pos_session_amounts a
  where a.session_id = p_session_id;

  -- LOT 27 : aucune vente n'existe. Le théorique est le fond de caisse.
  return v_float;
end;
$$;

comment on function public.pos_session_expected(uuid) is
  'Montant théorique de clôture = fond de caisse (+ encaissements en espèces au LOT 28). Dérivé, jamais stocké (D1). NULL si les montants ne sont pas lisibles.';

revoke execute on function public.pos_session_expected(uuid) from public, anon;
grant  execute on function public.pos_session_expected(uuid) to authenticated, service_role;


create or replace function public.pos_session_variance(p_session_id uuid)
returns bigint
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_counted  bigint;
  v_expected bigint;
begin
  perform public.require_capability(array['pos.sessions.view'], 'consulter une session de caisse');

  select a.counted_amount into v_counted
  from public.pos_session_amounts a
  where a.session_id = p_session_id;

  if v_counted is null then
    return null;  -- session ouverte, ou montants non lisibles
  end if;

  v_expected := public.pos_session_expected(p_session_id);
  if v_expected is null then
    return null;
  end if;

  return v_counted - v_expected;
end;
$$;

comment on function public.pos_session_variance(uuid) is
  'Écart = montant compté − montant théorique. Positif : excédent ; négatif : manque. Dérivé, jamais stocké (D1) ; NULL si ouverte ou non lisible.';

revoke execute on function public.pos_session_variance(uuid) from public, anon;
grant  execute on function public.pos_session_variance(uuid) to authenticated, service_role;


-- =============================================================================
-- 7. « QUI ÉTAIT EN CAISSE LE J ENTRE 10H00 ET 11H30 ? »
--
-- Recouvrement de deux intervalles semi-ouverts :
--   session  [ouverture, clôture)   — ouverte : jusqu'à +∞
--   fenêtre  [début, fin)
--
-- L'expression est EXACTEMENT celle de l'index GiST (migration 108). Aucun
-- montant n'est rendu : la session seule, que `pos.sessions.view` ouvre.
-- =============================================================================

create or replace function public.pos_sessions_in_window(
  p_from        timestamptz,
  p_to          timestamptz,
  p_register_id uuid default null,
  p_cashier_id  uuid default null
)
returns setof public.pos_sessions
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  perform public.require_capability(array['pos.sessions.view'], 'consulter les sessions de caisse');

  if p_from is null or p_to is null then
    raise exception 'La fenêtre interrogée exige un début et une fin.' using errcode = 'check_violation';
  end if;
  if p_to <= p_from then
    raise exception 'La fin de la fenêtre doit suivre son début.' using errcode = 'check_violation';
  end if;

  return query
    select s.*
    from public.pos_sessions s
    where tstzrange(s.opened_at, coalesce(s.closed_at, 'infinity'::timestamptz), '[)')
          && tstzrange(p_from, p_to, '[)')
      and (p_register_id is null or s.register_id = p_register_id)
      and (p_cashier_id  is null or s.cashier_id  = p_cashier_id)
    order by s.opened_at;
end;
$$;

comment on function public.pos_sessions_in_window(timestamptz, timestamptz, uuid, uuid) is
  'Sessions dont la période [ouverture, clôture) recouvre la fenêtre [début, fin). Répond à « qui était en caisse ? ». Aucun montant.';

revoke execute on function public.pos_sessions_in_window(timestamptz, timestamptz, uuid, uuid) from public, anon;
grant  execute on function public.pos_sessions_in_window(timestamptz, timestamptz, uuid, uuid) to authenticated, service_role;


-- =============================================================================
-- 8. CONTRÔLES
-- =============================================================================

do $$
declare
  v_def text;
  v_fn  text;
begin
  -- D4.
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.create_pos_register(text, uuid, text)'::regprocedure,
      'public.update_pos_register(uuid, text, uuid, text)'::regprocedure,
      'public.set_pos_register_active(uuid, boolean, text)'::regprocedure,
      'public.open_pos_session(uuid, bigint)'::regprocedure,
      'public.close_pos_session(uuid, bigint, text)'::regprocedure,
      'public.pos_session_expected(uuid)'::regprocedure,
      'public.pos_session_variance(uuid)'::regprocedure,
      'public.pos_sessions_in_window(timestamptz, timestamptz, uuid, uuid)'::regprocedure
    ) and prosecdef
  ) then
    raise exception 'Une fonction du point de vente est SECURITY DEFINER (D4).';
  end if;

  -- Chaque acte ouvre ET referme son drapeau.
  foreach v_fn in array array[
    'public.create_pos_register(text, uuid, text)|adikom.pos_register',
    'public.update_pos_register(uuid, text, uuid, text)|adikom.pos_register',
    'public.set_pos_register_active(uuid, boolean, text)|adikom.pos_register',
    'public.open_pos_session(uuid, bigint)|adikom.pos_session',
    'public.close_pos_session(uuid, bigint, text)|adikom.pos_session'
  ] loop
    v_def := pg_get_functiondef(split_part(v_fn, '|', 1)::regprocedure);
    if v_def not like '%' || split_part(v_fn, '|', 2) || ''', ''on''%'
       or v_def not like '%' || split_part(v_fn, '|', 2) || ''', ''off''%' then
      raise exception '% n''ouvre pas, ou ne referme pas, son drapeau.', split_part(v_fn, '|', 1);
    end if;
    if v_def not like '%require_capability%' then
      raise exception '% ne vérifie aucune capacité.', split_part(v_fn, '|', 1);
    end if;
  end loop;

  -- Aucun acte n'écrit dans la trésorerie (B-9 : aucune écriture d'ajustement).
  foreach v_fn in array array[
    'public.open_pos_session(uuid, bigint)',
    'public.close_pos_session(uuid, bigint, text)'
  ] loop
    if pg_get_functiondef(v_fn::regprocedure) ilike '%treasury_entries%' then
      raise exception '% touche la trésorerie : B-9 l''interdit.', v_fn;
    end if;
  end loop;

  -- `anon` n'exécute rien.
  if has_function_privilege('anon', 'public.open_pos_session(uuid, bigint)', 'EXECUTE')
     or has_function_privilege('anon', 'public.close_pos_session(uuid, bigint, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.pos_sessions_in_window(timestamptz, timestamptz, uuid, uuid)', 'EXECUTE') then
    raise exception 'anon peut exécuter une fonction du point de vente.';
  end if;

  raise notice
    '[OK] 109. Cinq actes et trois dérivés : aucun SECURITY DEFINER, drapeaux refermés, aucune écriture de trésorerie.';
end $$;
