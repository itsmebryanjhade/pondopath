-- Connect Google: run the Drive file sync every 10 minutes (apply only AFTER the app is deployed, with Bryan's approval).
-- The job sends only the cron secret, never Google tokens or file content. Store the secret in Supabase Vault first:
--   select vault.create_secret('<GOOGLE_SYNC_CRON_SECRET value>', 'google_sync_cron_secret');   -- Bryan runs this; never commit the value.
-- Replace <APP_URL> with the deployed origin, e.g. https://pondopath.example.com
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'pondopath-google-sync',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/intake/google/sync',
    headers := jsonb_build_object('authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'google_sync_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
-- To stop it: select cron.unschedule('pondopath-google-sync');
