-- =============================================================================
-- 0013_sandbox_test_bank.sql — make the sandbox payout bank usable
--
-- Paystack's test mode accepts `POST /transferrecipient` only for certain bank
-- codes; its test code `001` resolves names but is rejected for recipients
-- ("Cannot resolve account"). The sandbox row therefore settles through Access
-- Bank (044), which test mode accepts.
--
-- `banks.code` stays unique for real banks but test rows may share a code with
-- their real counterpart.
-- =============================================================================

drop index if exists public.banks_code_key;

create unique index if not exists banks_code_key
  on public.banks (code)
  where code is not null and not is_test;

update public.banks
set code = '044'
where name = 'Test Bank (sandbox)';
