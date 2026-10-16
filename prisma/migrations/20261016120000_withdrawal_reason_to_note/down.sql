-- Reverses 20261016120000_withdrawal_reason_to_note. Run with `npm run migrate:down`.
--
-- Only the column comes back, empty. The reasons were merged into `note` going up and
-- cannot be split back out reliably, so they stay there: nothing is lost, it is just
-- not in the old column. The previous code expects a reason on new withdrawals only,
-- and reads an old row's NULL reason as "Penarikan".

ALTER TABLE `transactions`
    ADD COLUMN `reason` VARCHAR(200) NULL AFTER `counterpart_wallet_id`;
