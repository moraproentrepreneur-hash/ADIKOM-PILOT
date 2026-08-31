-- =============================================================================
-- ADIKOM PILOT — 051 · Régler une facture n'exige pas le droit de l'écrire
-- Étape 2.5 (DEC-021), correction du LOT 6
--
-- LE DÉFAUT
--
-- `record_supplier_payment` verrouillait la facture par
-- `select … for update`, afin de sérialiser deux règlements simultanés et de
-- faire tenir le plafond de Workflow 08 §22.
--
-- Sous RLS, `SELECT … FOR UPDATE` n'applique pas seulement la policy de
-- LECTURE : il applique aussi celle d'ÉCRITURE. Or la policy d'UPDATE de
-- `supplier_invoices` exige `update`, `validate` ou `cancel` — trois capacités
-- qu'un payeur n'a aucune raison de détenir.
--
-- Résultat : le porteur des cinq capacités exactes de §21 et §22 voyait sa
-- facture déclarée « introuvable ». Le verrou technique réclamait un droit
-- métier que l'acte ne suppose pas — exactement ce que DEC-024 proscrit.
--
-- LA CORRECTION
--
-- Un VERROU CONSULTATIF sur l'identifiant de la facture. Il sérialise les
-- règlements concurrents sur la même facture — ce que le `for update` cherchait
-- — sans réclamer le moindre droit d'écriture sur elle. Il tombe avec la
-- transaction.
--
-- La facture est ensuite lue par un `select` ordinaire : la policy de LECTURE
-- suffit, et c'est bien `billing.supplier_invoices.view` que la fonction exige.
--
-- Rien d'autre ne change : mêmes capacités, mêmes contrôles, mêmes refus.
-- =============================================================================

create or replace function public.record_supplier_payment(
  p_invoice_id   uuid,
  p_account_id   uuid,
  p_amount       bigint,
  p_paid_on      date,
  p_method       public.payment_method,
  p_external_ref text default null,
  p_notes        text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id       uuid;
  v_no       text;
  f          public.supplier_invoices%rowtype;
  v_acc      public.financial_accounts%rowtype;
  v_gross    bigint;
  v_imputed  bigint;
  v_paid     bigint;
  v_due      bigint;
begin
  perform public.require_capability(
    array['billing.supplier_payments.create'], 'enregistrer un règlement fournisseur'
  );
  perform public.require_capability(
    array['billing.supplier_payments.view'], 'consulter les règlements de cette facture'
  );
  perform public.require_capability(
    array['billing.supplier_invoices.view'], 'consulter la facture à régler'
  );
  perform public.require_capability(
    array['billing.imputations.view'], 'consulter les imputations qui réduisent la facture'
  );
  perform public.require_capability(
    array['treasury.accounts.view'], 'consulter le compte à mouvementer'
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant du règlement doit être un entier positif, en KMF.'
      using errcode = 'check_violation';
  end if;

  if p_paid_on is null then
    raise exception 'La date réelle du règlement est obligatoire (Workflow 08 §11).'
      using errcode = 'check_violation';
  end if;

  /*
   * SÉRIALISER SANS RÉCLAMER UN DROIT D'ÉCRITURE.
   *
   * Deux règlements simultanés sur la même facture doivent se suivre, sans quoi
   * chacun verrait le même reste dû et le plafond de §22 laisserait passer les
   * deux. Le verrou consultatif l'assure, et ne suppose aucune capacité de
   * modification de la facture.
   */
  perform pg_advisory_xact_lock(hashtext(p_invoice_id::text)::bigint);

  select * into f from public.supplier_invoices where id = p_invoice_id;

  if not found then
    raise exception
      'La facture à régler est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if f.status <> 'VALIDATED' then
    raise exception
      'Opération refusée : seule une facture fournisseur validée peut être réglée.'
      using errcode = 'check_violation';
  end if;

  select * into v_acc from public.financial_accounts where id = p_account_id;

  if not found then
    raise exception
      'Le compte financier est introuvable ou n''est pas lisible avec vos droits.'
      using errcode = 'no_data_found';
  end if;

  if v_acc.status <> 'ACTIVE' then
    raise exception
      'Opération refusée : le compte « % » n''est pas actif. Un compte inactif ou archivé ne reçoit plus de nouvelle opération (Module 06 §10).',
      v_acc.label
      using errcode = 'check_violation';
  end if;

  if v_acc.currency_code is distinct from f.currency_code then
    raise exception
      'Opération refusée : la devise du compte (%) diffère de celle de la facture (%). Aucune conversion n''est définie.',
      v_acc.currency_code, f.currency_code
      using errcode = 'check_violation';
  end if;

  v_gross   := public.supplier_invoice_gross(p_invoice_id);
  v_imputed := public.supplier_invoice_imputed(p_invoice_id);
  v_paid    := public.supplier_invoice_paid(p_invoice_id);
  v_due     := v_gross - v_imputed - v_paid;

  if v_due <= 0 then
    raise exception
      'Opération refusée : cette facture est déjà soldée. Aucun règlement supplémentaire n''est accepté (Workflow 08 §23).'
      using errcode = 'check_violation';
  end if;

  if p_amount > v_due then
    raise exception
      'Opération refusée : le règlement (% KMF) dépasse le reste dû sur cette facture (% KMF). Aucun solde négatif n''est créé automatiquement (Workflow 08 §22).',
      p_amount, v_due
      using errcode = 'check_violation';
  end if;

  v_no := public.next_number('payment');

  insert into public.supplier_payments
    (payment_no, supplier_invoice_id, account_id, amount, paid_on, method,
     external_ref, notes, validated_by, created_by, updated_by)
  values
    (v_no, p_invoice_id, p_account_id, p_amount, p_paid_on, p_method,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''),
     public.current_actor(), public.current_actor(), public.current_actor())
  returning id into v_id;

  insert into public.treasury_entries
    (account_id, entry_date, direction, kind, amount, description, reference,
     supplier_payment_id, created_by, updated_by)
  values
    (p_account_id, p_paid_on, 'OUT', 'SUPPLIER_PAYMENT', p_amount,
     'Règlement ' || v_no || ' — facture ' || f.invoice_no,
     nullif(btrim(coalesce(p_external_ref, '')), ''),
     v_id, public.current_actor(), public.current_actor());

  return v_id;
end;
$$;

comment on function public.record_supplier_payment is
  'Constate un décaissement et produit son écriture (§13, §47). Sérialise par verrou consultatif : régler une facture n''exige pas le droit de l''écrire.';

do $$
declare v_total int;
begin
  select count(*) into v_total from public.permissions;
  if v_total <> 153 then
    raise exception 'Catalogue attendu à 153 permissions, obtenu %.', v_total;
  end if;
end $$;
