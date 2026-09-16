-- Reverses 20260916120000_rename_default_wallet, putting the seeded default wallet back
-- to "Kencan". Required by PRD v2 section 9.1 ("Down migration wajib ada dan wajib diuji").
--
-- Run with `npm run migrate:down`. Prisma has no native down migration, so this file is
-- applied by the mysql client directly. The script also deletes this migration's row from
-- `_prisma_migrations` afterwards, so `prisma migrate deploy` re-applies it rather than
-- believing the database is already up to date.
--
-- Nothing to refuse here, unlike the v2 down migration: this is one column of one row per
-- user, and the up migration dropped no data. The guards mirror the up migration exactly --
-- only the seeded default wallet, and only where the old name is still free under
-- `uq_wallet_user_name`. See that file for why the guard is a self-join and not a subquery.
--
-- Not perfectly symmetric, and deliberately so: a user who renamed their default wallet to
-- something else after the up migration is left alone by both directions, which is what
-- they asked for by renaming it.

UPDATE `wallets` AS `w`
LEFT JOIN `wallets` AS `taken`
  ON `taken`.`user_id` = `w`.`user_id`
 AND `taken`.`name` = 'Kencan'
SET `w`.`name` = 'Kencan'
WHERE `w`.`name` = 'Pengeluaran'
  AND `w`.`type` = 'DATE_BUDGET'
  AND `w`.`is_default` = 1
  AND `taken`.`id` IS NULL;
