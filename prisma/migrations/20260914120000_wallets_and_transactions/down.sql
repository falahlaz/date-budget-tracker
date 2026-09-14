-- Reverses 20260914120000_wallets_and_transactions, back to the v1.1 schema.
-- Required and tested by PRD v2 section 9.1 ("Down migration wajib ada dan wajib diuji")
-- and test M2.
--
-- Run with `npm run migrate:down`. Prisma has no native down migration, so this file is
-- applied by the mysql client directly. The script also deletes this migration's row from
-- `_prisma_migrations` afterwards, so `prisma migrate deploy` re-applies it rather than
-- believing the database is already up to date. Running this file by hand skips that step.
--
-- IT REFUSES RATHER THAN DESTROYS. Two v2 states have no representation in the v1.1
-- schema, and silently dropping them would turn a rollback into data loss:
--
--   1. Any transaction whose `kind` is not SPEND -- deposits, withdrawals, transfers.
--      v1.1 has only expenses. There is nowhere to put these rows.
--   2. Two categories sharing (user_id, name) across different wallet_types -- the savings
--      seed creates a second "Lain-lain". Restoring `uq_category_user_name` would fail on
--      them anyway, but it would fail halfway through, after other tables had changed.
--
-- Both are checked first and abort the script with a named error. If you hit one, decide
-- deliberately what to do with those rows and delete them yourself, then re-run.
--
-- This is genuinely lossless only against a database that has not yet accepted v2 data,
-- which is exactly the state M2 exercises: restore the pre-migration dump, migrate up,
-- migrate down, compare.

-- ---------------------------------------------------------------------------
-- 0. guards
--    MySQL has no RAISE in a plain script, and a conditional subquery is still parsed
--    when the condition is false. Preparing the statement only when the guard trips is
--    the one form that actually short-circuits. The missing TABLE name is the message,
--    because that is the part MySQL prints: "Table 'db.REFUSING_TO_...' doesn't exist".
--    `DO 1` is the no-op branch because, unlike SELECT 1, it prints nothing.
-- ---------------------------------------------------------------------------

SET @non_spend := (SELECT COUNT(*) FROM `transactions` WHERE `kind` <> 'SPEND');
SET @guard := IF(@non_spend > 0,
    'SELECT 1 FROM `REFUSING_TO_ROLL_BACK__delete_non_SPEND_transactions_first`',
    'DO 1');
PREPARE guard_stmt FROM @guard;
EXECUTE guard_stmt;
DEALLOCATE PREPARE guard_stmt;

SET @dup_categories := (
    SELECT COUNT(*) FROM (
        SELECT `user_id`, `name` FROM `categories`
        GROUP BY `user_id`, `name` HAVING COUNT(*) > 1
    ) `duplicates`
);
SET @guard := IF(@dup_categories > 0,
    'SELECT 1 FROM `REFUSING_TO_ROLL_BACK__categories_share_a_name_across_wallet_types`',
    'DO 1');
PREPARE guard_stmt FROM @guard;
EXECUTE guard_stmt;
DEALLOCATE PREPARE guard_stmt;

-- ---------------------------------------------------------------------------
-- 1. receipts point back at expenses
-- ---------------------------------------------------------------------------

ALTER TABLE `receipts` DROP FOREIGN KEY `fk_receipt_transaction`;
ALTER TABLE `receipts` RENAME INDEX `idx_receipt_transaction` TO `idx_receipt_expense`;
ALTER TABLE `receipts` CHANGE `transaction_id` `expense_id` INTEGER UNSIGNED NOT NULL;
-- Still references `transactions` here; step 5 renames the table and the FK follows.
ALTER TABLE `receipts` ADD CONSTRAINT `fk_receipt_expense` FOREIGN KEY (`expense_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. the savings tables go away (their foreign keys go with them)
-- ---------------------------------------------------------------------------

DROP TABLE `repayment_allocations`;
DROP TABLE `savings_goals`;

-- ---------------------------------------------------------------------------
-- 3. categories lose their wallet_type
--    Add the old unique key before dropping the new one: `fk_category_user` needs a
--    user_id-leftmost index at every point in between.
-- ---------------------------------------------------------------------------

ALTER TABLE `categories` ADD UNIQUE INDEX `uq_category_user_name`(`user_id`, `name`);
ALTER TABLE `categories` DROP INDEX `uq_category_user_type_name`;
ALTER TABLE `categories` DROP COLUMN `wallet_type`;

-- ---------------------------------------------------------------------------
-- 4. monthly_budgets lose their wallet
-- ---------------------------------------------------------------------------

ALTER TABLE `monthly_budgets` DROP FOREIGN KEY `fk_budget_wallet`;
ALTER TABLE `monthly_budgets` ADD UNIQUE INDEX `uq_budget_user_period`(`user_id`, `period`);
ALTER TABLE `monthly_budgets` DROP INDEX `uq_budget_wallet_period`;
-- Only now, with uq_budget_user_period back, is this one redundant for `fk_budget_user`.
ALTER TABLE `monthly_budgets` DROP INDEX `idx_budget_user`;
ALTER TABLE `monthly_budgets` DROP COLUMN `wallet_id`;

-- ---------------------------------------------------------------------------
-- 5. transactions -> expenses
-- ---------------------------------------------------------------------------

-- Restore the v1.1 lookup index before removing the wallet ones.
ALTER TABLE `transactions` ADD INDEX `idx_expense_user_date`(`user_id`, `occurred_on`, `deleted_at`);
ALTER TABLE `transactions` RENAME INDEX `idx_txn_category` TO `idx_expense_category`;
ALTER TABLE `transactions` RENAME INDEX `idx_txn_merchant` TO `idx_expense_merchant`;

ALTER TABLE `transactions` DROP FOREIGN KEY `fk_txn_wallet`;
ALTER TABLE `transactions`
    DROP INDEX `idx_txn_wallet_date`,
    DROP INDEX `idx_txn_kind`,
    DROP INDEX `idx_txn_transfer`,
    DROP INDEX `idx_txn_advance`;

ALTER TABLE `transactions`
    DROP COLUMN `wallet_id`,
    DROP COLUMN `kind`,
    DROP COLUMN `direction`,
    DROP COLUMN `transfer_group_id`,
    DROP COLUMN `counterpart_wallet_id`,
    DROP COLUMN `reason`,
    DROP COLUMN `expected_return`,
    DROP COLUMN `returned_amount`,
    DROP COLUMN `settled_at`,
    CHANGE `occurred_on` `spent_on` DATE NOT NULL;

RENAME TABLE `transactions` TO `expenses`;

-- ---------------------------------------------------------------------------
-- 6. and the wallets themselves
-- ---------------------------------------------------------------------------

DROP TABLE `wallets`;
