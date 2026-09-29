-- Loans (piutang): money lent to someone out of a wallet, and paid back into one.
--
-- Additive: two new transaction kinds and two new tables. The money itself stays on
-- `transactions` -- a LOAN_OUT row in the wallet it left, a LOAN_IN row for every
-- repayment -- and the engines treat those exactly like transfers out and in.

ALTER TABLE `transactions`
    MODIFY `kind` ENUM('SPEND', 'DEPOSIT', 'WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_OUT', 'LOAN_IN') NOT NULL DEFAULT 'SPEND';

CREATE TABLE `loans` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `borrower_name` VARCHAR(80) NOT NULL,
    `wallet_id` INTEGER UNSIGNED NOT NULL,
    `transaction_id` INTEGER UNSIGNED NOT NULL,
    `due_date` DATE NULL,
    `note` VARCHAR(255) NULL,
    `settled_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_loan_txn`(`transaction_id`),
    INDEX `idx_loan_user`(`user_id`, `settled_at`),
    INDEX `idx_loan_wallet`(`wallet_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `loan_repayments` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `loan_id` INTEGER UNSIGNED NOT NULL,
    `transaction_id` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_loanpay_txn`(`transaction_id`),
    INDEX `idx_loanpay_loan`(`loan_id`),
    INDEX `idx_loanpay_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `loans` ADD CONSTRAINT `fk_loan_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loans` ADD CONSTRAINT `fk_loan_wallet` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loans` ADD CONSTRAINT `fk_loan_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loan_repayments` ADD CONSTRAINT `fk_loanpay_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loan_repayments` ADD CONSTRAINT `fk_loanpay_loan` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loan_repayments` ADD CONSTRAINT `fk_loanpay_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
