-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- 13.11.2026, 10:02 — czat: obejścia filtra zauważone w trakcie dyżuru.
--   „purrno jub”        → podwojona litera omijało regułę „porn”
--   „dawid jest pedalsem” → forma „pedalsem” nie była na liście (był tylko „pedalem”)
--
-- Dodajemy wyłącznie zakaz NOWYCH wpisów. Nic nie jest kasowane, nikogo nie banujemy.

insert into public.rejchat_blocked_phrases (phrase, match_mode)
values
  ('purrno', 'word'),
  ('pedalsem', 'word'),
  ('pedalsy', 'word'),
  ('pedalsow', 'word')
on conflict do nothing;
