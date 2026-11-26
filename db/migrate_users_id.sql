-- StudyHub: fix an old `users` table whose id is CHAR(36) instead of a number.
-- Run this in phpMyAdmin (inside the studyhub database).
--
-- SAFE TO RUN MORE THAN ONCE: it first checks the id column. If id is already
-- a number, it changes nothing and just reports "nothing to do".
--
-- Why: the PHP code (api/signup.php, index.php) expects users.id to be an
-- auto-numbered integer that matches user_id in tasks, notes, schedules, etc.
-- With CHAR(36) the first signup gets an empty id (the app treats it as user 0)
-- and every later signup fails with a duplicate-key error.
--
-- What it does: numbers the existing accounts 1, 2, 3... and makes id a
-- BIGINT UNSIGNED AUTO_INCREMENT primary key. Usernames, names, roles and
-- password hashes are untouched, so everyone can still log in.
-- Afterwards, everyone must sign out and sign in again.

USE studyhub;

-- Does the table still have the old text id? (1 = yes, fix it; 0 = already fixed)
SET @needs_fix := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'id' AND DATA_TYPE IN ('char', 'varchar')
);

-- 1. Add the new numeric id next to the old one (existing rows get 1, 2, 3...).
SET @sql := IF(@needs_fix,
  'ALTER TABLE users ADD COLUMN new_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE FIRST',
  'DO 0');
PREPARE step FROM @sql; EXECUTE step; DEALLOCATE PREPARE step;

-- 2. Remove the old text id.
SET @sql := IF(@needs_fix,
  'ALTER TABLE users DROP PRIMARY KEY, DROP COLUMN id',
  'DO 0');
PREPARE step FROM @sql; EXECUTE step; DEALLOCATE PREPARE step;

-- 3. Rename the new column to `id` and make it the primary key.
SET @sql := IF(@needs_fix,
  'ALTER TABLE users CHANGE new_id id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (id), DROP INDEX new_id',
  'DO 0');
PREPARE step FROM @sql; EXECUTE step; DEALLOCATE PREPARE step;

SELECT IF(@needs_fix,
  'Done: users.id is now a number. Everyone must sign out and sign in again.',
  'Nothing to do: users.id is already a number.') AS result;
