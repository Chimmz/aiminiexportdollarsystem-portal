-- mini-export-web now takes payments through Flutterwave as well as
-- Paystack (and sends them here over a server-to-server API instead of
-- writing to this DB directly -- see src/app/api/webhooks/sales-site).
-- paystack_reference was never anything but "this payment's reference at
-- whichever gateway took it", so it's renamed rather than adding a second,
-- gateway-specific column; `gateway` records which one actually applies.
-- Every existing row is a real Paystack payment, so the default backfills
-- them correctly with no manual update needed.
alter table public.payments
  rename column paystack_reference to payment_reference;

alter table public.payments
  add column if not exists gateway text not null default 'paystack'
    check (gateway in ('paystack', 'flutterwave'));

-- The sales site's checkout form collects a phone number but leads had
-- nowhere to put it -- carried through to users.phone on conversion (see
-- convert-lead.ts) the same way name already is.
alter table public.leads
  add column if not exists phone text;
