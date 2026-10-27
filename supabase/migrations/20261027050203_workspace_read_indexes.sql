create index customers_business_idx on public.customers (business_id);
alter table public.followups drop constraint followups_correction_movement_id_key;
alter table public.followups add constraint followups_correction_movement_business_key unique (correction_movement_id,business_id);
