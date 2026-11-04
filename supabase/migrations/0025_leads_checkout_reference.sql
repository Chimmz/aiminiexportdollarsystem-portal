-- Captures the gateway reference (Paystack or Flutterwave) of the most
-- recent checkout attempt a lead started, even if they never completed
-- it -- lets a drop-off be looked up in the gateway's own dashboard, and
-- is the hook a future payment-reminder job would use to know who to
-- email. Overwritten on each new attempt by the same lead; once a
-- payment actually succeeds, the authoritative reference lives on
-- payments.payment_reference instead -- this column is deliberately only
-- about the pre-payment, possibly-abandoned attempt.
alter table public.leads
  add column if not exists last_checkout_reference text;
