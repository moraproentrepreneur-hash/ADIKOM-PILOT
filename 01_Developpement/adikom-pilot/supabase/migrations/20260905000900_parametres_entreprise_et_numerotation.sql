-- =============================================================================
-- ADIKOM PILOT — 068 · Paramètres — Entreprise & Numérotation
-- Phase 4 — Organisation, LOT 16 (Module 09 · DEC-005, DEC-008)
--
-- CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS
--
-- Elle ne crée AUCUNE table et AUCUNE capacité.
--
-- `company_settings` et `numbering_rules` existent depuis la migration 005 ;
-- les neuf capacités `settings.*` sont au catalogue depuis la 007. Le catalogue
-- reste à 170 (DEC-024).
--
-- Ce qu'elle livre, ce sont les frontières que les écrans supposent et que la
-- base ne tenait pas encore.
--
--
-- 1. UNE SEULE LIGNE, HUIT SECTIONS, QUATRE CAPACITÉS — Module 09 §31 à §38
--
-- `company_settings` est un SINGLETON : toute la configuration d'ADIKOM tient
-- sur une ligne. Or RLS est ROW-level. Une policy d'`UPDATE` exigeant
-- `settings.company.update` autorisait donc, du même geste, la modification du
-- registre de commerce (§34) et des coordonnées bancaires (§37) — alors que le
-- catalogue leur donne depuis toujours leurs propres capacités.
--
-- Le même défaut valait en LECTURE : `settings.company.view` rendait la ligne
-- ENTIÈRE, colonnes sensibles comprises. §42 l'interdit mot pour mot :
-- « un utilisateur ne disposant pas des permissions nécessaires ne doit pas
-- pouvoir les consulter ou les modifier ».
--
-- C'est le troisième exemple du même piège dans ce projet — après les coûts de
-- maintenance (migration 041, résolu par des tables séparées) et l'activation
-- d'un groupe (migration 060, résolue par un déclencheur). Ici, les colonnes ne
-- peuvent pas déménager : la solution est celle du journal d'activité, à savoir
-- des DROITS DE COLONNE en lecture et un DÉCLENCHEUR en écriture.
--
--
-- 2. UN COMPTEUR NE SE RÈGLE PAS À LA MAIN — Module 09 §16
--
-- §16 exige que le système empêche « doublons, collisions, réutilisation
-- accidentelle ». `numbering_rules.current_value` porte le dernier numéro émis.
-- La policy d'`UPDATE` de la migration 006 laissait un compte doté de
-- `settings.numbering.update` le ramener en arrière — et la facture suivante
-- aurait repris un numéro déjà utilisé, sans qu'aucune erreur ne le signale.
--
-- Le compteur n'appartient qu'à `next_number`.
--
--
-- 3. L'ANNÉE D'UN NUMÉRO EST L'ANNÉE D'ADIKOM — Module 09 §17
--
-- `next_number` lisait l'année sur UTC. Les Comores étant à UTC+3, le 1er
-- janvier commence à Moroni trois heures avant qu'UTC ne change d'année : une
-- facture émise le 1er janvier entre 00 h 00 et 03 h 00 aurait porté l'année
-- PRÉCÉDENTE, et le compteur ne se serait pas remis à zéro (DEC-025 §e).
--
-- Références : 03_Modules/09_Parametres.md §16, §17, §30, §34, §37, §42, §44 ;
--              05_Regles_Metier/06_Audit.md §43 ; CLAUDE.md §19, §19 bis, §44 ;
--              DEC-005, DEC-008, DEC-024, DEC-025 §e, DEC-035 §b.
-- =============================================================================


-- =============================================================================
-- 1. LECTURE — LES SECTIONS SENSIBLES SORTENT DE PORTÉE DE L'API
-- =============================================================================
--
-- RLS filtre des LIGNES ; elle ne sait pas retirer une COLONNE. Le SELECT de
-- table est donc retiré et rendu colonne par colonne, les sept colonnes
-- sensibles exclues — quatre pour l'administratif (§34), trois pour la banque
-- (§37).
--
-- Elles restent lisibles par `company_settings_sensitive()`, qui exige la
-- capacité correspondante, et par le rôle de service.
--
-- ATTENTION — LE SELECT NE PEUT PAS ÊTRE RETIRÉ EN ENTIER. Un `UPDATE` sous
-- RLS doit pouvoir lire les lignes qu'il vise ; sans aucun droit de lecture, il
-- ne modifierait rien et ne le dirait pas.

revoke select on public.company_settings from authenticated;

grant select (
  id,
  legal_name, trade_name, acronym, description, activity, tagline, internal_code,
  address_line1, address_line2, city, country, phone, email, website,
  main_activity, secondary_activities, commercial_description,
  invoice_display_name, invoice_address, invoice_footer_notes, invoice_legal_notes,
  logo_path, logo_secondary_path, color_primary, color_secondary, color_accent,
  currency_code, currency_label, locale, timezone, date_format,
  rental_duration_rounding, rental_buffer_minutes, imputation_approval_threshold,
  updated_at, updated_by
) on public.company_settings to authenticated;

-- §44 : « le système doit empêcher la suppression accidentelle de paramètres
-- essentiels ». TRUNCATE ne déclenche AUCUN trigger de ligne : le garde-fou
-- `company_settings_no_delete` de la migration 005 ne l'aurait pas vu passer.
-- Ces droits sont des accords par défaut dont aucun usage n'existe.
revoke insert, delete, truncate on public.company_settings from authenticated;
revoke delete, truncate            on public.numbering_rules  from authenticated;

comment on column public.company_settings.registration_number is
  'Section Administratif (§34). Hors de portée de l''API : settings.company.administrative.view.';
comment on column public.company_settings.bank_account_details is
  'Section Banque (§37). Hors de portée de l''API : settings.company.bank.view.';


-- --- Les deux sections sensibles, sous leur propre capacité -------------------
--
-- Une seule fonction pour les deux sections, et non deux : l'écran les demande
-- ensemble, et un refus doit se distinguer d'une valeur vide (DEC-017). Les
-- drapeaux `may_read_*` permettent à l'écran de DIRE « non consultable » au
-- lieu d'afficher des champs vides qui se liraient « non renseigné ».

create or replace function public.company_settings_sensitive()
returns table (
  may_read_administrative boolean,
  may_read_bank           boolean,
  registration_number     text,
  tax_identifier          text,
  legal_form              text,
  administrative_notes    text,
  bank_name               text,
  bank_account_holder     text,
  bank_account_details    text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_super  boolean := public.is_super_admin();
  v_admin  boolean;
  v_bank   boolean;
begin
  -- La lecture des paramètres commande l'accès à la fonction : sans elle, même
  -- l'existence d'une configuration reste fermée (§30).
  if not (v_super or public.has_permission('settings.company.view')) then
    raise exception 'Consultation des paramètres non autorisée.'
      using errcode = '42501';
  end if;

  v_admin := v_super or public.has_permission('settings.company.administrative.view');
  v_bank  := v_super or public.has_permission('settings.company.bank.view');

  return query
  select
    v_admin,
    v_bank,
    case when v_admin then s.registration_number  end,
    case when v_admin then s.tax_identifier       end,
    case when v_admin then s.legal_form           end,
    case when v_admin then s.administrative_notes end,
    case when v_bank  then s.bank_name            end,
    case when v_bank  then s.bank_account_holder  end,
    case when v_bank  then s.bank_account_details end
  from public.company_settings s
  where s.id;
end;
$$;

comment on function public.company_settings_sensitive() is
  'Sections Administratif (§34) et Banque (§37) des paramètres, chacune sous sa propre capacité.';


-- =============================================================================
-- 2. ÉCRITURE — LA POLICY DIT QUI ÉCRIT, LE DÉCLENCHEUR DIT QUOI
-- =============================================================================
--
-- La répartition est celle de DEC-035 §b, déjà appliquée aux projets et aux
-- groupes :
--
--   La POLICY dit qui peut écrire dans la table.
--   Le DÉCLENCHEUR dit qui peut accomplir CET acte-là.
--
-- Sans l'élargissement de la policy, un compte doté de la seule capacité
-- bancaire se verrait refuser l'écriture AVANT même d'atteindre le déclencheur
-- — le défaut exact que la migration 061 avait corrigé pour les groupes.

drop policy if exists company_settings_update on public.company_settings;

create policy company_settings_update on public.company_settings
  for update to authenticated
  using (
    (select
       public.has_permission('settings.company.update')
       or public.has_permission('settings.company.administrative.update')
       or public.has_permission('settings.company.bank.update')
       or public.has_permission('settings.branding.update'))
  )
  with check (
    (select
       public.has_permission('settings.company.update')
       or public.has_permission('settings.company.administrative.update')
       or public.has_permission('settings.company.bank.update')
       or public.has_permission('settings.branding.update'))
  );


create or replace function public.fn_company_settings_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_actor();
begin
  -- Le singleton reste un singleton : la clé ne se change pas.
  if new.id is distinct from old.id then
    raise exception 'La configuration d''ADIKOM est unique et sa clé ne se modifie pas.';
  end if;

  -- Aucun acteur : migration, script d'environnement, correction par le rôle de
  -- service. Les règles de COHÉRENCE ci-dessus s'appliquent quand même ; les
  -- règles de CAPACITÉ n'ont pas de sens sans quelqu'un à qui les opposer.
  if v_actor is null then
    return new;
  end if;

  if public.is_super_admin(v_actor) then
    return new;
  end if;

  -- --- Section Administratif (§34) -------------------------------------------
  if (new.registration_number  is distinct from old.registration_number)
     or (new.tax_identifier       is distinct from old.tax_identifier)
     or (new.legal_form           is distinct from old.legal_form)
     or (new.administrative_notes is distinct from old.administrative_notes)
  then
    if not public.has_permission('settings.company.administrative.update', v_actor) then
      raise exception 'Modifier les informations administratives requiert une autorisation dédiée.'
        using errcode = '42501';
    end if;
  end if;

  -- --- Section Banque (§37) --------------------------------------------------
  if (new.bank_name            is distinct from old.bank_name)
     or (new.bank_account_holder  is distinct from old.bank_account_holder)
     or (new.bank_account_details is distinct from old.bank_account_details)
  then
    if not public.has_permission('settings.company.bank.update', v_actor) then
      raise exception 'Modifier les informations bancaires requiert une autorisation dédiée.'
        using errcode = '42501';
    end if;
  end if;

  -- --- Section Identité visuelle (§38) ---------------------------------------
  if (new.logo_path           is distinct from old.logo_path)
     or (new.logo_secondary_path is distinct from old.logo_secondary_path)
     or (new.color_primary       is distinct from old.color_primary)
     or (new.color_secondary     is distinct from old.color_secondary)
     or (new.color_accent        is distinct from old.color_accent)
  then
    if not public.has_permission('settings.branding.update', v_actor) then
      raise exception 'Modifier l''identité visuelle requiert une autorisation dédiée.'
        using errcode = '42501';
    end if;
  end if;

  -- --- Tout le reste ---------------------------------------------------------
  --
  -- Identité, coordonnées, commercial, facturation, préférences et paramètres
  -- opérationnels. Comparé colonne par colonne PLUTÔT que par soustraction : un
  -- `to_jsonb(new) - 'bank_name' - …` aurait laissé passer toute colonne
  -- ajoutée plus tard sans que personne ne s'en aperçoive.
  if (new.legal_name          is distinct from old.legal_name)
     or (new.trade_name             is distinct from old.trade_name)
     or (new.acronym                is distinct from old.acronym)
     or (new.description            is distinct from old.description)
     or (new.activity               is distinct from old.activity)
     or (new.tagline                is distinct from old.tagline)
     or (new.internal_code          is distinct from old.internal_code)
     or (new.address_line1          is distinct from old.address_line1)
     or (new.address_line2          is distinct from old.address_line2)
     or (new.city                   is distinct from old.city)
     or (new.country                is distinct from old.country)
     or (new.phone                  is distinct from old.phone)
     or (new.email                  is distinct from old.email)
     or (new.website                is distinct from old.website)
     or (new.main_activity          is distinct from old.main_activity)
     or (new.secondary_activities   is distinct from old.secondary_activities)
     or (new.commercial_description is distinct from old.commercial_description)
     or (new.invoice_display_name   is distinct from old.invoice_display_name)
     or (new.invoice_address        is distinct from old.invoice_address)
     or (new.invoice_footer_notes   is distinct from old.invoice_footer_notes)
     or (new.invoice_legal_notes    is distinct from old.invoice_legal_notes)
     or (new.currency_code          is distinct from old.currency_code)
     or (new.currency_label         is distinct from old.currency_label)
     or (new.locale                 is distinct from old.locale)
     or (new.timezone               is distinct from old.timezone)
     or (new.date_format            is distinct from old.date_format)
     or (new.rental_duration_rounding      is distinct from old.rental_duration_rounding)
     or (new.rental_buffer_minutes         is distinct from old.rental_buffer_minutes)
     or (new.imputation_approval_threshold is distinct from old.imputation_approval_threshold)
  then
    if not public.has_permission('settings.company.update', v_actor) then
      raise exception 'Modifier les paramètres de l''entreprise requiert une autorisation.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_company_settings_write_guard() is
  'Chaque section des paramètres exige SA capacité (§34, §37, §38, DEC-024).';

drop trigger if exists company_settings_write_guard on public.company_settings;

create trigger company_settings_write_guard
  before update on public.company_settings
  for each row execute function public.fn_company_settings_write_guard();


-- =============================================================================
-- 3. LE COMPTEUR N'APPARTIENT QU'À `next_number` — §16
-- =============================================================================
--
-- Le drapeau de session est posé par `next_number` juste avant son écriture, et
-- il est LOCAL à la transaction : il disparaît avec elle, et aucune requête de
-- l'application ne peut le poser — `set_config` n'est pas exposé par l'API.

create or replace function public.fn_numbering_rules_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_generated boolean := coalesce(current_setting('adikom.numbering', true), '') = 'on';
begin
  -- La clé identifie la règle dans tout le code applicatif : elle ne bouge pas.
  if new.entity_key is distinct from old.entity_key then
    raise exception 'La clé d''une règle de numérotation ne se modifie pas.';
  end if;

  -- Un format vide produirait des références inexploitables.
  if btrim(coalesce(new.prefix, '')) = '' then
    raise exception 'Le préfixe d''une règle de numérotation ne peut pas être vide.';
  end if;

  -- LE POINT CENTRAL (§16). Le compteur et l'exercice ne se règlent que par la
  -- génération d'un numéro. Les remettre en arrière ferait RÉÉMETTRE des
  -- références déjà utilisées — sur des factures, donc.
  if not v_generated
     and ((new.current_value is distinct from old.current_value)
          or (new.current_year is distinct from old.current_year))
  then
    raise exception 'Le compteur d''une numérotation ne se modifie pas : un numéro ne se réutilise jamais.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_numbering_rules_write_guard() is
  'Le compteur d''une numérotation n''appartient qu''à next_number (§16).';

drop trigger if exists numbering_rules_write_guard on public.numbering_rules;

create trigger numbering_rules_write_guard
  before update on public.numbering_rules
  for each row execute function public.fn_numbering_rules_write_guard();


-- =============================================================================
-- 4. L'ANNÉE D'UN NUMÉRO EST CELLE D'ADIKOM — §17, DEC-025 §e
-- =============================================================================
--
-- Seules deux choses changent par rapport à la migration 005 : le fuseau de
-- l'année, et le drapeau qui autorise l'écriture du compteur. Le format produit
-- est identique.

create or replace function public.next_number(p_entity_key text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        public.numbering_rules%rowtype;
  -- Le jour — et donc l'exercice — est celui d'ADIKOM, pas celui du serveur.
  -- Aux Comores (UTC+3), l'année change trois heures avant qu'elle ne change en
  -- UTC : une facture du 1er janvier à 01 h 00 aurait porté l'année précédente.
  v_year   int := extract(year from (now() at time zone 'Indian/Comoro'))::int;
  v_next   bigint;
  v_result text;
begin
  select * into r
  from public.numbering_rules
  where entity_key = p_entity_key
  for update;

  if not found then
    raise exception 'Aucune règle de numérotation définie pour « % ».', p_entity_key
      using errcode = 'raise_exception';
  end if;

  if r.reset_yearly and r.current_year is distinct from v_year then
    v_next := 1;
  else
    v_next := r.current_value + 1;
  end if;

  -- Autorise l'écriture du compteur pour cette transaction, et pour elle seule.
  perform set_config('adikom.numbering', 'on', true);

  update public.numbering_rules
     set current_value = v_next,
         current_year  = v_year,
         updated_at    = now()
   where entity_key = p_entity_key;

  perform set_config('adikom.numbering', 'off', true);

  v_result := r.prefix;

  if r.include_year then
    v_result := v_result || r.separator || v_year::text;
  end if;

  v_result := v_result || r.separator || lpad(v_next::text, r.padding, '0');

  return v_result;
end;
$$;

comment on function public.next_number(text) is
  'Numéro suivant pour un type d''objet. Atomique, et daté sur l''exercice comorien (§17, DEC-025 §e).';


-- =============================================================================
-- 5. LE JOURNAL D'ACTIVITÉ VOIT LES PARAMÈTRES DE NUMÉROTATION
-- =============================================================================
--
-- Le déclencheur d'audit de la migration 005 ne se déclenche que sur un
-- changement de FORMAT, pas sur l'incrément du compteur — et c'est voulu (§80 :
-- ne conserver que ce qui sert la traçabilité). Rien à changer.
--
-- En revanche, `audit_detail_permission` (migration 064) doit déjà nommer les
-- deux tables. Le contrôle est dans la recette du journal ; il est rappelé ici
-- pour que la vérification échoue au bon endroit si l'une d'elles changeait de
-- nom.
do $$
begin
  if public.audit_detail_permission('company_settings') is null
     or public.audit_detail_permission('numbering_rules') is null
  then
    raise exception 'Les paramètres ne sont pas cartographiés par le journal d''activité.';
  end if;
end $$;


-- =============================================================================
-- 6. DROITS D'EXÉCUTION — DEC-022
-- =============================================================================

revoke execute on function public.company_settings_sensitive()        from public;
revoke execute on function public.company_settings_sensitive()        from anon;
revoke execute on function public.fn_company_settings_write_guard()   from public;
revoke execute on function public.fn_numbering_rules_write_guard()    from public;

grant execute on function public.company_settings_sensitive() to authenticated, service_role;
