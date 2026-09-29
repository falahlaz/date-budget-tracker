-- Reverses 20260929120000_loans. Run with `npm run migrate:down`.
--
-- IT REFUSES RATHER THAN DESTROYS. A LOAN_OUT or LOAN_IN row is money that moved in or out
-- of a wallet, and the older schema has no kind to hold it. Dropping those rows would
-- silently change wallet balances, so the script aborts while any exist (soft-deleted ones
-- included -- the enum shrink would fail on them halfway through). Delete them yourself,
-- deliberately, then re-run. Same guard mechanics as 20260914120000's down.sql.

SET @loan_rows := (SELECT COUNT(*) FROM `transactions` WHERE `kind` IN ('LOAN_OUT', 'LOAN_IN'));
SET @guard := IF(@loan_rows > 0,
    'SELECT 1 FROM `REFUSING_TO_ROLL_BACK__delete_LOAN_transactions_first`',
    'DO 1');
PREPARE guard_stmt FROM @guard;
EXECUTE guard_stmt;
DEALLOCATE PREPARE guard_stmt;

DROP TABLE IF EXISTS `loan_repayments`;
DROP TABLE IF EXISTS `loans`;

ALTER TABLE `transactions`
    MODIFY `kind` ENUM('SPEND', 'DEPOSIT', 'WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT') NOT NULL DEFAULT 'SPEND';
