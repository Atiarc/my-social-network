-- Apply only after the preflight query returns zero rows.
-- Does not delete or rewrite existing profiles.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
ON public.profiles (lower(trim(username)))
WHERE username IS NOT NULL AND trim(username) <> '';
