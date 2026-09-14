-- v2 migration: wallets, and `expenses` becomes `transactions`.
-- NORMATIVE SOURCE: PRD v2 section 9.1.
--
-- Hand-written on purpose. `prisma migrate dev` diffs the schema and would emit
-- `DROP TABLE expenses` + `CREATE TABLE transactions`, which is every row Falah has.
-- The rename has to be spelled out, so this file is authored and `migrate resolve`d
-- rather than generated. Verified against the generated target with:
--
--   prisma migrate diff --from-migrations prisma/migrations \
--     --to-schema-datamodel prisma/schema.prisma \
--     --shadow-database-url $SHADOW_DATABASE_URL --exit-code
--
-- BEFORE RUNNING THIS: `npm run backup`. PRD v2 section 9.1 step 0 requires a dated dump
-- stored outside the container, and `scripts/backup.sh` already produces exactly that.
--
-- ONE CORRECTION TO THE PRD's SQL, marked `-- PRD FIX` at step 6. An index whose leftmost
-- column backs a foreign key cannot be dropped while it is the only such index. Step 6 as
-- written aborts with:
--
--   ERROR 1553 (HY000): Cannot drop index 'uq_budget_user_period': needed in a foreign
--   key constraint
--
-- Verified by running the PRD's statement verbatim against MySQL 8.0.46. Steps 5 and 7
-- were checked the same way and are correct as the PRD writes them.

-- ---------------------------------------------------------------------------
-- 1. wallets
-- ---------------------------------------------------------------------------

CREATE TABLE `wallets` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `type` ENUM('DATE_BUDGET', 'SAVINGS') NOT NULL,
    `color` CHAR(7) NOT NULL DEFAULT '#5C63C4',
    `icon` VARCHAR(40) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` SMALLINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_wallet_user`(`user_id`, `is_archived`),
    UNIQUE INDEX `uq_wallet_user_name`(`user_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `wallets` ADD CONSTRAINT `fk_wallet_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. a default wallet for every user that already exists
--    This is what lets an endpoint called without `walletId` keep working (section 4.2).
-- ---------------------------------------------------------------------------

INSERT INTO `wallets` (`user_id`, `name`, `type`, `is_default`, `sort_order`)
SELECT `id`, 'Kencan', 'DATE_BUDGET', 1, 0 FROM `users`;

-- ---------------------------------------------------------------------------
-- 3. expenses -> transactions
-- ---------------------------------------------------------------------------

RENAME TABLE `expenses` TO `transactions`;

-- `AFTER` keeps the physical column order readable: id, user_id, wallet_id, kind,
-- direction, category_id, occurred_on, ...
ALTER TABLE `transactions`
    CHANGE `spent_on` `occurred_on` DATE NOT NULL,
    ADD COLUMN `wallet_id` INTEGER UNSIGNED NULL AFTER `user_id`,
    ADD COLUMN `kind` ENUM('SPEND', 'DEPOSIT', 'WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT') NOT NULL DEFAULT 'SPEND' AFTER `wallet_id`,
    ADD COLUMN `direction` ENUM('IN', 'OUT') NOT NULL DEFAULT 'OUT' AFTER `kind`,
    ADD COLUMN `transfer_group_id` CHAR(36) NULL,
    ADD COLUMN `counterpart_wallet_id` INTEGER UNSIGNED NULL,
    ADD COLUMN `reason` VARCHAR(200) NULL,
    ADD COLUMN `expected_return` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `returned_amount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `settled_at` DATETIME(0) NULL;

-- ---------------------------------------------------------------------------
-- 4. backfill: every existing row belongs to the Kencan wallet and is a SPEND
-- ---------------------------------------------------------------------------

UPDATE `transactions` `t`
    JOIN `wallets` `w`
      ON `w`.`user_id` = `t`.`user_id`
     AND `w`.`type` = 'DATE_BUDGET'
     AND `w`.`is_default` = 1
SET `t`.`wallet_id` = `w`.`id`,
    `t`.`kind` = 'SPEND',
    `t`.`direction` = 'OUT';

-- ---------------------------------------------------------------------------
-- 5. only now is it locked down
--    If step 4 missed a row, this MODIFY fails -- which is the behaviour we want.
-- ---------------------------------------------------------------------------

ALTER TABLE `transactions` MODIFY `wallet_id` INTEGER UNSIGNED NOT NULL;

-- The indexes go in before the foreign key so InnoDB adopts `idx_txn_wallet_date` instead
-- of silently creating a redundant index of its own named after the constraint.
ALTER TABLE `transactions`
    ADD INDEX `idx_txn_wallet_date`(`wallet_id`, `occurred_on`, `deleted_at`),
    ADD INDEX `idx_txn_kind`(`wallet_id`, `kind`, `deleted_at`),
    ADD INDEX `idx_txn_transfer`(`transfer_group_id`),
    ADD INDEX `idx_txn_advance`(`wallet_id`, `expected_return`, `settled_at`);

ALTER TABLE `transactions` ADD CONSTRAINT `fk_txn_wallet` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Metadata-only renames, so the table has no `expense` vocabulary left in it. The two
-- inherited FOREIGN KEYS keep their v1.1 names (`fk_expense_user`, `fk_expense_category`)
-- deliberately: renaming a constraint means dropping and re-adding it, which re-validates
-- every row, and this is the one table worth not touching more than necessary.
ALTER TABLE `transactions` RENAME INDEX `idx_expense_category` TO `idx_txn_category`;
ALTER TABLE `transactions` RENAME INDEX `idx_expense_merchant` TO `idx_txn_merchant`;

-- Safe: `fk_expense_user` is on `user_id`, and `idx_txn_merchant` (user_id, merchant_key,
-- deleted_at) is still user_id-leftmost, so the constraint keeps a backing index.
-- Do not drop `idx_txn_merchant` later without adding another user_id-leftmost index.
ALTER TABLE `transactions` DROP INDEX `idx_expense_user_date`;

-- ---------------------------------------------------------------------------
-- 6. monthly_budgets are scoped to a wallet
-- ---------------------------------------------------------------------------

ALTER TABLE `monthly_budgets` ADD COLUMN `wallet_id` INTEGER UNSIGNED NULL AFTER `user_id`;

UPDATE `monthly_budgets` `mb`
    JOIN `wallets` `w`
      ON `w`.`user_id` = `mb`.`user_id`
     AND `w`.`type` = 'DATE_BUDGET'
     AND `w`.`is_default` = 1
SET `mb`.`wallet_id` = `w`.`id`;

ALTER TABLE `monthly_budgets` MODIFY `wallet_id` INTEGER UNSIGNED NOT NULL;

-- PRD FIX. The PRD drops `uq_budget_user_period` and adds `uq_budget_wallet_period` in one
-- statement. That fails: `fk_budget_user` is on `user_id`, `uq_budget_user_period`
-- (user_id, period) is the only user_id-leftmost index, and the replacement is keyed on
-- `wallet_id` so it cannot take over. Give the constraint its own index first -- wanted
-- anyway, since BudgetsService.list() still queries by user.
ALTER TABLE `monthly_budgets` ADD INDEX `idx_budget_user`(`user_id`);
ALTER TABLE `monthly_budgets` ADD UNIQUE INDEX `uq_budget_wallet_period`(`wallet_id`, `period`);
ALTER TABLE `monthly_budgets` DROP INDEX `uq_budget_user_period`;

ALTER TABLE `monthly_budgets` ADD CONSTRAINT `fk_budget_wallet` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. categories are scoped to a wallet TYPE
--    Spending categories and withdrawal categories are different vocabularies, so the
--    same name is allowed to exist in both -- which is why the unique key moves.
-- ---------------------------------------------------------------------------

ALTER TABLE `categories` ADD COLUMN `wallet_type` ENUM('DATE_BUDGET', 'SAVINGS') NOT NULL DEFAULT 'DATE_BUDGET' AFTER `user_id`;

-- Not a fix: the PRD's single combined ALTER works here, because the replacement key is
-- itself user_id-leftmost and MySQL validates the end state rather than each clause. Split
-- into two statements only so this step reads the same way as step 6.
ALTER TABLE `categories` ADD UNIQUE INDEX `uq_category_user_type_name`(`user_id`, `wallet_type`, `name`);
ALTER TABLE `categories` DROP INDEX `uq_category_user_name`;

-- ---------------------------------------------------------------------------
-- 8. the new savings tables
-- ---------------------------------------------------------------------------

CREATE TABLE `savings_goals` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `wallet_id` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `target_amount` INTEGER NOT NULL,
    `opening_balance` INTEGER NOT NULL DEFAULT 0,
    `start_date` DATE NOT NULL,
    `deadline` DATE NOT NULL,
    `plan_per_month` INTEGER NOT NULL,
    `plan_revised_at` DATETIME(0) NULL,
    `status` ENUM('ACTIVE', 'ACHIEVED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `achieved_at` DATETIME(0) NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_goal_wallet`(`wallet_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- At most one ACTIVE goal per wallet. MySQL 8 has no partial unique index, so that rule
-- lives in the service layer inside a DB transaction (section 9.3).

CREATE TABLE `repayment_allocations` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `deposit_transaction_id` INTEGER UNSIGNED NOT NULL,
    `withdrawal_transaction_id` INTEGER UNSIGNED NOT NULL,
    `amount` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_alloc_withdrawal`(`withdrawal_transaction_id`),
    UNIQUE INDEX `uq_alloc_pair`(`deposit_transaction_id`, `withdrawal_transaction_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `savings_goals` ADD CONSTRAINT `fk_goal_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `savings_goals` ADD CONSTRAINT `fk_goal_wallet` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `repayment_allocations` ADD CONSTRAINT `fk_alloc_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `repayment_allocations` ADD CONSTRAINT `fk_alloc_deposit` FOREIGN KEY (`deposit_transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- RESTRICT is what enforces section 8.8 at the database rather than only in the service:
-- an advance that has been partly repaid cannot be deleted out from under its deposits.
ALTER TABLE `repayment_allocations` ADD CONSTRAINT `fk_alloc_withdraw` FOREIGN KEY (`withdrawal_transaction_id`) REFERENCES `transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 9. receipts point at transactions, not expenses
--    Last, so a problem here cannot entangle the rename above. Not in the PRD, but the
--    Prisma model is now `Transaction`: leaving the column as `expense_id` would mean a
--    permanent @map and the word "expense" surviving in code that no longer has the idea.
-- ---------------------------------------------------------------------------

ALTER TABLE `receipts` DROP FOREIGN KEY `fk_receipt_expense`;
ALTER TABLE `receipts` CHANGE `expense_id` `transaction_id` INTEGER UNSIGNED NOT NULL;
ALTER TABLE `receipts` RENAME INDEX `idx_receipt_expense` TO `idx_receipt_transaction`;
ALTER TABLE `receipts` ADD CONSTRAINT `fk_receipt_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
