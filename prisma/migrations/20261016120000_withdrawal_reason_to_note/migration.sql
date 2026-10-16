-- A withdrawal's "why" now lives in `note`, like every other transaction's free text.
--
-- The separate mandatory `reason` field made the withdraw sheet ask for a sentence before
-- the amount; it is gone, and the amount leads. Existing reasons are carried into `note`
-- before the column is dropped so no sentence a user already wrote is lost:
--
--   * no note            -> the reason becomes the note
--   * reason and a note  -> "reason — note", cut to the column's 500
--   * a bill payment     -> left alone: its note is already "Tagihan <bill> (<period>)",
--                           and the "Bayar tagihan ..." reason would only repeat it

UPDATE `transactions`
SET `note` = TRIM(`reason`)
WHERE NULLIF(TRIM(`reason`), '') IS NOT NULL
  AND NULLIF(TRIM(`note`), '') IS NULL;

UPDATE `transactions`
SET `note` = LEFT(CONCAT(TRIM(`reason`), ' — ', TRIM(`note`)), 500)
WHERE NULLIF(TRIM(`reason`), '') IS NOT NULL
  AND NULLIF(TRIM(`note`), '') IS NOT NULL
  AND TRIM(`note`) <> TRIM(`reason`)
  AND `id` NOT IN (SELECT `transaction_id` FROM `bill_payments`);

ALTER TABLE `transactions` DROP COLUMN `reason`;
