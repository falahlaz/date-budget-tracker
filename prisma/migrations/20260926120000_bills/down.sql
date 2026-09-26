-- Reverses 20260926120000_bills. Run with `npm run migrate:down`.
--
-- Drops the bill tables only. The transactions that paid bills are ordinary SPEND and
-- WITHDRAW rows and stay exactly where they are, so no money disappears from any wallet;
-- what is lost is the link saying which bill and month each one settled.

DROP TABLE IF EXISTS `bill_payments`;
DROP TABLE IF EXISTS `bills`;
