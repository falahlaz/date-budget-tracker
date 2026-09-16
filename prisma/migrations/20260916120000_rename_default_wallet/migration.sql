-- Renames the seeded default wallet from "Kencan" to "Pengeluaran".
--
-- The app dropped its dating theme when it was renamed from datebud to budget-tracker,
-- but the wallet every account starts with kept the old name. This brings existing rows
-- in line with DEFAULT_WALLET (src/modules/wallets/default-wallet.ts), so accounts
-- created before and after the rename show the same wallet name.
--
-- DATA ONLY. The schema does not change and neither does the `DATE_BUDGET` enum value --
-- that is a domain term, not the app's name. `prisma migrate dev` diffs the schema and
-- would emit nothing here, so this file is hand-authored, the same way
-- 20260914120000_wallets_and_transactions is. Verify the schema really is untouched with:
--
--   prisma migrate diff --from-migrations prisma/migrations \
--     --to-schema-datamodel prisma/schema.prisma \
--     --shadow-database-url $SHADOW_DATABASE_URL --exit-code
--
-- TWO GUARDS, both of which matter:
--
--   1. `is_default = 1 AND type = 'DATE_BUDGET'` -- only the wallet the migration seeded.
--      A wallet the user created and named "Kencan" themselves is their choice to keep.
--   2. The anti-join on `taken` -- `uq_wallet_user_name` is unique on (user_id, name). A
--      user who already has a wallet called "Pengeluaran" would make this UPDATE fail on a
--      duplicate key and abort the migration, so those rows are left alone instead. They
--      keep the old name; renaming from the switcher is one tap.
--
-- The guard is a self-join rather than a subquery on purpose. MySQL refuses to read the
-- table being updated from a FROM clause (ER_UPDATE_TABLE_USED, 1093), and the usual
-- workaround -- wrapping it in a derived table -- is not reliable on MySQL 8.0, where
-- `derived_merge` is on by default and can merge the wrapper straight back into the outer
-- query, raising 1093 again. A multi-table UPDATE has no such restriction.
--
-- One row per user at most, so the self-join cannot see its own writes: `uq_wallet_user_name`
-- already makes "Kencan" unique per user, and the join is confined to a single `user_id`.

UPDATE `wallets` AS `w`
LEFT JOIN `wallets` AS `taken`
  ON `taken`.`user_id` = `w`.`user_id`
 AND `taken`.`name` = 'Pengeluaran'
SET `w`.`name` = 'Pengeluaran'
WHERE `w`.`name` = 'Kencan'
  AND `w`.`type` = 'DATE_BUDGET'
  AND `w`.`is_default` = 1
  AND `taken`.`id` IS NULL;
