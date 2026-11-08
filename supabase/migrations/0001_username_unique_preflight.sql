-- READ-ONLY CHECK. Run this before the unique-index migration.
-- If this query returns rows, resolve duplicate usernames before proceeding.
SELECT lower(trim(username)) AS normalized_username,
       count(*) AS total,
       array_agg(id) AS profile_ids
FROM public.profiles
WHERE username IS NOT NULL AND trim(username) <> ''
GROUP BY lower(trim(username))
HAVING count(*) > 1;
