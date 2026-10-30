-- Aktywne czyszczenie: dostęp wygasa dokładnie po 3 dniach, a części są
-- usuwane ze Storage API w kolejnym przebiegu (co 15 minut).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('rejfile-expired-cleanup','*/15 * * * *',
$job$select net.http_post(
  url := 'https://hzbqzfimtroixnldzjeq.supabase.co/functions/v1/rejfile',
  headers := jsonb_build_object('Content-Type','application/json','apikey',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1cGFiYXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE'),
  body := '{"action":"cleanup"}'::jsonb, timeout_milliseconds := 15000
);$job$);
