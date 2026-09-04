-- =============================================================================
-- 0008_payments_node.sql — Link a verified payment to the node it delivered
--
-- payments.node (nullable FK → nodes) is set once a verified payment has
-- fully delivered (funding credit + node + purchase splits). It is the
-- delivery marker: a duplicate callback sees node != null and is a no-op, and
-- a retry after a mid-delivery failure re-runs cleanly (node still null).
--
-- Additive only: 0007 untouched; existing payments rows keep node = null.
-- =============================================================================

alter table public.payments add column node uuid references public.nodes (id);
create index if not exists payments_node_idx on public.payments (node);
