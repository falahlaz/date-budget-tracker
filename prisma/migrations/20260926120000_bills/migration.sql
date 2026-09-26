-- Bills: things owed monthly (or once), paid by hand from any wallet.
--
-- Additive only: two new tables, nothing existing is touched. `bill_payments` links a
-- bill's period to the transaction that paid it; the money itself stays on `transactions`.

CREATE TABLE `bills` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `platform` VARCHAR(60) NULL,
    `amount` INTEGER NOT NULL,
    `kind` ENUM('INSTALLMENT', 'RECURRING', 'ONE_TIME') NOT NULL,
    `category` ENUM('CICILAN', 'LANGGANAN', 'UTILITAS', 'ASURANSI', 'PENDIDIKAN', 'LAINNYA') NOT NULL,
    `due_day` TINYINT UNSIGNED NOT NULL,
    `start_period` CHAR(7) NOT NULL,
    `end_period` CHAR(7) NULL,
    `note` VARCHAR(255) NULL,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_bill_user`(`user_id`, `is_archived`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `bill_payments` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `bill_id` INTEGER UNSIGNED NOT NULL,
    `transaction_id` INTEGER UNSIGNED NOT NULL,
    `period` CHAR(7) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_billpay_bill_period`(`bill_id`, `period`),
    UNIQUE INDEX `uq_billpay_txn`(`transaction_id`),
    INDEX `idx_billpay_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `bills` ADD CONSTRAINT `fk_bill_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `bill_payments` ADD CONSTRAINT `fk_billpay_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `bill_payments` ADD CONSTRAINT `fk_billpay_bill` FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `bill_payments` ADD CONSTRAINT `fk_billpay_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
