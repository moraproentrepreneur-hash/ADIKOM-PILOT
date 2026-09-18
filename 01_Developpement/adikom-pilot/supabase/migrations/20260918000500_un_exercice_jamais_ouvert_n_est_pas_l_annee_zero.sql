-- =============================================================================
-- ADIKOM PILOT — 091 · Un exercice jamais ouvert n'est pas l'année zéro
-- LOT 22 — correction découverte par `supabase/tests/backup.sql`
--
-- LE DÉFAUT, ET COMMENT IL S'EST RÉVÉLÉ
--
-- `restore_configuration` (migration 075) réapplique les règles de numérotation
-- d'une sauvegarde, en veillant à ce que le compteur NE RECULE JAMAIS :
--
--     current_year = greatest(coalesce(n.current_year, 0), coalesce(r.current_year, 0))
--
-- Les `coalesce` transforment un exercice ENCORE JAMAIS OUVERT — `NULL` — en
-- l'année **0**. C'est une MODIFICATION du compteur, et
-- `fn_numbering_rules_write_guard` la refuse, à juste titre : le compteur et
-- l'exercice n'appartiennent qu'à `next_number` (Module 09 §16).
--
-- POURQUOI LE DÉFAUT NE S'ÉTAIT JAMAIS VU
--
-- Parce que les quinze règles existantes avaient TOUTES produit au moins un
-- numéro : leur `current_year` n'était jamais nul, et `coalesce` ne changeait
-- rien. Le LOT 22 ajoute `rental_amendment` — une règle qui n'a encore rien
-- numéroté. Dès lors, TOUTE restauration échouait.
--
-- C'est `verify:backup` qui l'a trouvé, sur un cycle réel de réinitialisation et
-- de restauration. Une recette qui se serait contentée de lire la fonction
-- n'aurait rien vu.
--
-- LA CORRECTION, ET CE QU'ELLE PRÉSERVE
--
-- `greatest` IGNORE DÉJÀ LES NULL en PostgreSQL : `greatest(null, 5)` vaut 5, et
-- `greatest(null, null)` vaut `null`. Les `coalesce` n'apportaient donc rien —
-- ils ne faisaient que fabriquer un zéro là où il fallait laisser l'absence.
--
--   · un exercice ouvert reste ouvert, et ne recule pas ;
--   · un exercice jamais ouvert reste NUL — et la garde n'a rien à refuser.
--
-- `current_value` est `not null` : sa ligne est inchangée.
--
-- AUCUN AUTRE COMPORTEMENT N'EST MODIFIÉ. La fonction est reprise à
-- l'identique, à ces deux `coalesce` près.
-- =============================================================================

create or replace function public.restore_configuration(p_configuration jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb;
begin
  if p_configuration is null or jsonb_typeof(p_configuration) <> 'object' then
    return;
  end if;

  v_settings := p_configuration -> 'company_settings';

  if v_settings is not null and jsonb_typeof(v_settings) = 'array'
     and jsonb_array_length(v_settings) = 1 then
    update public.company_settings c
       set legal_name             = s.legal_name,
           trade_name             = s.trade_name,
           acronym                = s.acronym,
           description            = s.description,
           activity               = s.activity,
           tagline                = s.tagline,
           internal_code          = s.internal_code,
           address_line1          = s.address_line1,
           address_line2          = s.address_line2,
           city                   = s.city,
           country                = s.country,
           phone                  = s.phone,
           email                  = s.email,
           website                = s.website,
           registration_number    = s.registration_number,
           tax_identifier         = s.tax_identifier,
           legal_form             = s.legal_form,
           administrative_notes   = s.administrative_notes,
           main_activity          = s.main_activity,
           secondary_activities   = s.secondary_activities,
           commercial_description = s.commercial_description,
           invoice_display_name   = s.invoice_display_name,
           invoice_address        = s.invoice_address,
           invoice_footer_notes   = s.invoice_footer_notes,
           invoice_legal_notes    = s.invoice_legal_notes,
           bank_name              = s.bank_name,
           bank_account_holder    = s.bank_account_holder,
           bank_account_details   = s.bank_account_details,
           color_primary          = s.color_primary,
           color_secondary        = s.color_secondary,
           color_accent           = s.color_accent,
           currency_code          = s.currency_code,
           currency_label         = s.currency_label,
           locale                 = s.locale,
           timezone               = s.timezone,
           date_format            = s.date_format
      from jsonb_populate_recordset(null::public.company_settings, v_settings) s
     where c.id;
  end if;

  if p_configuration -> 'numbering_rules' is not null
     and jsonb_typeof(p_configuration -> 'numbering_rules') = 'array' then
    update public.numbering_rules n
       set label         = r.label,
           prefix        = r.prefix,
           include_year  = r.include_year,
           padding       = r.padding,
           separator     = r.separator,
           reset_yearly  = r.reset_yearly,
           -- Le compteur ne recule jamais (§16).
           current_value = greatest(n.current_value, r.current_value),
           /*
            * `greatest` IGNORE LES NULL : un exercice jamais ouvert le reste.
            * Le `coalesce(..., 0)` d'origine le transformait en l'année ZÉRO —
            * une modification du compteur, que la garde refuse.
            */
           current_year  = greatest(n.current_year, r.current_year)
      from jsonb_populate_recordset(
             null::public.numbering_rules, p_configuration -> 'numbering_rules') r
     where n.entity_key = r.entity_key;
  end if;
end;
$$;

comment on function public.restore_configuration(jsonb) is
  'Réapplique la configuration d''une sauvegarde. Le compteur de numérotation ne recule jamais, et un exercice jamais ouvert n''est pas l''année zéro (Module 09 §16).';

revoke execute on function public.restore_configuration(jsonb) from public, anon, authenticated;
grant  execute on function public.restore_configuration(jsonb) to service_role;


-- =============================================================================
-- CONTRÔLE
-- =============================================================================

do $$
declare v_src text;
begin
  select pg_get_functiondef('public.restore_configuration(jsonb)'::regprocedure) into v_src;

  if v_src like '%coalesce(n.current_year%' or v_src like '%coalesce(r.current_year%' then
    raise exception
      'La restauration fabrique encore une année zéro pour un exercice jamais ouvert.';
  end if;

  -- La règle du LOT 22 existe, et son exercice n'est PAS ouvert : c'est
  -- exactement la ligne qui faisait échouer la restauration.
  if not exists (
    select 1 from public.numbering_rules where entity_key = 'rental_amendment'
  ) then
    raise exception 'La règle de numérotation des avenants est absente.';
  end if;

  raise notice
    '[OK] 091. La restauration laisse nul un exercice jamais ouvert ; % règle(s) de numérotation, dont % sans exercice ouvert.',
    (select count(*) from public.numbering_rules),
    (select count(*) from public.numbering_rules where current_year is null);
end $$;
