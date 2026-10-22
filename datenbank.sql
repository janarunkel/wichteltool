-- =========================================================
-- Familien-Wichteln: Datenbank für Supabase
--
-- So geht's: Im Supabase-Dashboard links "SQL Editor" öffnen,
-- diese komplette Datei hineinkopieren, in der letzten Zeile
-- DEIN-ADMIN-PASSWORT ersetzen und auf "Run" klicken.
--
-- Sicherheit: Niemand kann die Tabellen direkt lesen. Alles läuft
-- über die Funktionen unten, und die geben jeder Person nur ihre
-- eigene Zuordnung heraus. Die Auslosung passiert auf dem Server,
-- deshalb sieht auch der Admin nicht, wer wen beschenkt.
-- =========================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Tabellen ----------

create table if not exists public.wichtel_einstellungen (
  id           int primary key default 1 check (id = 1),
  budget       int not null default 50 check (budget between 1 and 10000),
  status       text not null default 'offen' check (status in ('offen', 'ausgelost')),
  admin_hash   text not null,
  ausgelost_am timestamptz
);

create table if not exists public.wichtel_teilnehmende (
  id          uuid primary key default extensions.gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  code_hash   text not null unique,
  wuensche    text[] not null default '{}' check (cardinality(wuensche) <= 3),
  erstellt_am timestamptz not null default now()
);

create unique index if not exists wichtel_teilnehmende_name_eindeutig
  on public.wichtel_teilnehmende (lower(name));

create table if not exists public.wichtel_zuordnung (
  schenker   uuid primary key references public.wichtel_teilnehmende (id) on delete cascade,
  empfaenger uuid not null unique references public.wichtel_teilnehmende (id) on delete cascade,
  check (schenker <> empfaenger)
);

-- Direkten Zugriff komplett sperren (Row Level Security ohne Freigaben).
alter table public.wichtel_einstellungen enable row level security;
alter table public.wichtel_teilnehmende enable row level security;
alter table public.wichtel_zuordnung enable row level security;
revoke all on public.wichtel_einstellungen, public.wichtel_teilnehmende, public.wichtel_zuordnung from anon, authenticated;

-- ---------- Hilfsfunktionen (nicht von außen aufrufbar) ----------

create or replace function public.wichtel_code_hash(p_code text)
returns text language sql immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'sha256'), 'hex');
$$;

-- Wünsche säubern: Leerzeichen kürzen, leere entfernen, höchstens 3 mit je 80 Zeichen.
create or replace function public.wichtel_wuensche_saeubern(p_wuensche text[])
returns text[] language sql immutable
as $$
  select coalesce(array_agg(w order by nr), '{}')
  from (
    select left(regexp_replace(btrim(w), '\s+', ' ', 'g'), 80) as w, nr
    from unnest(coalesce(p_wuensche, '{}')) with ordinality as t(w, nr)
    where btrim(coalesce(w, '')) <> ''
    order by nr
    limit 3
  ) s;
$$;

create or replace function public.wichtel_admin_check(p_passwort text)
returns void language plpgsql
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from wichtel_einstellungen
    where admin_hash = extensions.crypt(coalesce(p_passwort, ''), admin_hash)
  ) then
    perform pg_sleep(1); -- bremst das Durchprobieren von Passwörtern
    raise exception 'Das Admin-Passwort ist falsch.';
  end if;
end;
$$;

-- ---------- Funktionen für alle Teilnehmenden ----------

-- Öffentliche Infos: Budget, Status und wer schon mitmacht.
create or replace function public.wichtel_info()
returns json language sql stable security definer
set search_path = public, extensions
as $$
  select json_build_object(
    'budget', e.budget,
    'status', e.status,
    'namen', coalesce((select json_agg(name order by erstellt_am) from wichtel_teilnehmende), '[]'::json)
  )
  from wichtel_einstellungen e;
$$;

-- Anmelden. Gibt einen persönlichen Code zurück, der nur einmal angezeigt wird.
create or replace function public.wichtel_anmelden(p_name text, p_wuensche text[])
returns json language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_roh  text := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  v_code text := substr(v_roh, 1, 4) || '-' || substr(v_roh, 5, 4) || '-' || substr(v_roh, 9, 4) || '-' || substr(v_roh, 13, 4);
begin
  if (select status from wichtel_einstellungen) <> 'offen' then
    raise exception 'Die Anmeldung ist geschlossen, weil schon ausgelost wurde.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Bitte gib einen Namen mit 1 bis 40 Zeichen ein.';
  end if;
  if exists (select 1 from wichtel_teilnehmende where lower(name) = lower(v_name)) then
    raise exception 'Der Name „%“ ist schon angemeldet. Nutze z. B. einen Zusatz wie „% (Berlin)“.', v_name, v_name;
  end if;

  insert into wichtel_teilnehmende (name, code_hash, wuensche)
  values (v_name, wichtel_code_hash(v_code), wichtel_wuensche_saeubern(p_wuensche));

  return json_build_object('name', v_name, 'code', v_code);
end;
$$;

-- Eigene Daten und, nach der Auslosung, die eigene Zuordnung.
create or replace function public.wichtel_ich(p_code text)
returns json language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  v_ich  wichtel_teilnehmende;
  v_e    wichtel_einstellungen;
  v_empf wichtel_teilnehmende;
begin
  select * into v_ich from wichtel_teilnehmende where code_hash = wichtel_code_hash(p_code);
  if not found then
    raise exception 'Diesen Code gibt es nicht. Prüfe die Schreibweise.';
  end if;
  select * into v_e from wichtel_einstellungen;

  select t.* into v_empf
  from wichtel_zuordnung z join wichtel_teilnehmende t on t.id = z.empfaenger
  where z.schenker = v_ich.id;

  return json_build_object(
    'name', v_ich.name,
    'wuensche', to_json(v_ich.wuensche),
    'budget', v_e.budget,
    'status', v_e.status,
    'empfaenger', case when v_empf.id is null then null
                       else json_build_object('name', v_empf.name, 'wuensche', to_json(v_empf.wuensche)) end
  );
end;
$$;

-- Eigene Wünsche ändern (auch nach der Auslosung, der Wichtel sieht dann die neuen).
create or replace function public.wichtel_wuensche_speichern(p_code text, p_wuensche text[])
returns json language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_wuensche text[] := wichtel_wuensche_saeubern(p_wuensche);
begin
  update wichtel_teilnehmende set wuensche = v_wuensche
  where code_hash = wichtel_code_hash(p_code);
  if not found then
    raise exception 'Diesen Code gibt es nicht. Prüfe die Schreibweise.';
  end if;
  return to_json(v_wuensche);
end;
$$;

-- ---------- Funktionen für den Admin ----------

create or replace function public.wichtel_admin_uebersicht(p_passwort text)
returns json language plpgsql security definer
set search_path = public, extensions
as $$
begin
  perform wichtel_admin_check(p_passwort);
  return (
    select json_build_object(
      'budget', e.budget,
      'status', e.status,
      'ausgelost_am', e.ausgelost_am,
      'teilnehmende', coalesce((
        select json_agg(json_build_object('id', id, 'name', name, 'anzahl_wuensche', cardinality(wuensche)) order by erstellt_am)
        from wichtel_teilnehmende), '[]'::json)
    )
    from wichtel_einstellungen e
  );
end;
$$;

create or replace function public.wichtel_admin_budget(p_passwort text, p_budget int)
returns void language plpgsql security definer
set search_path = public, extensions
as $$
begin
  perform wichtel_admin_check(p_passwort);
  if p_budget is null or p_budget < 1 or p_budget > 10000 then
    raise exception 'Bitte gib einen ganzen Betrag zwischen 1 und 10.000 € ein.';
  end if;
  update wichtel_einstellungen set budget = p_budget;
end;
$$;

create or replace function public.wichtel_admin_entfernen(p_passwort text, p_id uuid)
returns void language plpgsql security definer
set search_path = public, extensions
as $$
begin
  perform wichtel_admin_check(p_passwort);
  if (select status from wichtel_einstellungen) <> 'offen' then
    raise exception 'Nach der Auslosung kann niemand entfernt werden. Setze zuerst die Auslosung zurück.';
  end if;
  delete from wichtel_teilnehmende where id = p_id;
end;
$$;

-- Auslosung: Liste zufällig mischen, jede Person beschenkt die nächste,
-- die letzte die erste. Danach werden alle Regeln noch einmal geprüft.
create or replace function public.wichtel_admin_auslosen(p_passwort text)
returns json language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_ids    uuid[];
  v_anzahl int;
begin
  perform wichtel_admin_check(p_passwort);
  perform 1 from wichtel_einstellungen for update;
  if (select status from wichtel_einstellungen) <> 'offen' then
    raise exception 'Es wurde bereits ausgelost.';
  end if;

  select array_agg(id order by extensions.gen_random_bytes(16)) into v_ids from wichtel_teilnehmende;
  v_anzahl := coalesce(cardinality(v_ids), 0);
  if v_anzahl < 2 then
    raise exception 'Für eine Auslosung sind mindestens zwei Personen erforderlich.';
  end if;

  delete from wichtel_zuordnung;
  insert into wichtel_zuordnung (schenker, empfaenger)
  select v_ids[i], v_ids[(i % v_anzahl) + 1] from generate_series(1, v_anzahl) as i;

  -- Kontrolle: alle schenken genau einmal, alle werden genau einmal beschenkt, niemand sich selbst.
  if (select count(*) from wichtel_zuordnung) <> v_anzahl
     or (select count(distinct empfaenger) from wichtel_zuordnung) <> v_anzahl
     or exists (select 1 from wichtel_zuordnung where schenker = empfaenger)
     or exists (select 1 from wichtel_teilnehmende t where not exists (select 1 from wichtel_zuordnung z where z.schenker = t.id)) then
    raise exception 'Die Auslosung war ungültig und wurde verworfen. Bitte erneut versuchen.';
  end if;

  update wichtel_einstellungen set status = 'ausgelost', ausgelost_am = now();
  return json_build_object('anzahl', v_anzahl);
end;
$$;

-- Auslosung verwerfen: Zuordnung löschen, Anmeldung wieder öffnen. Teilnehmende bleiben.
create or replace function public.wichtel_admin_auslosung_zuruecksetzen(p_passwort text)
returns void language plpgsql security definer
set search_path = public, extensions
as $$
begin
  perform wichtel_admin_check(p_passwort);
  delete from wichtel_zuordnung;
  update wichtel_einstellungen set status = 'offen', ausgelost_am = null;
end;
$$;

-- Runde beenden: alle Teilnehmenden, Wünsche und Zuordnungen löschen. Das Budget bleibt.
create or replace function public.wichtel_admin_runde_loeschen(p_passwort text)
returns void language plpgsql security definer
set search_path = public, extensions
as $$
begin
  perform wichtel_admin_check(p_passwort);
  delete from wichtel_zuordnung;
  delete from wichtel_teilnehmende;
  update wichtel_einstellungen set status = 'offen', ausgelost_am = null;
end;
$$;

-- ---------- Rechte: nur die öffentlichen Funktionen sind aufrufbar ----------

do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'wichtel\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

grant execute on function
  public.wichtel_info(),
  public.wichtel_anmelden(text, text[]),
  public.wichtel_ich(text),
  public.wichtel_wuensche_speichern(text, text[]),
  public.wichtel_admin_uebersicht(text),
  public.wichtel_admin_budget(text, int),
  public.wichtel_admin_entfernen(text, uuid),
  public.wichtel_admin_auslosen(text),
  public.wichtel_admin_auslosung_zuruecksetzen(text),
  public.wichtel_admin_runde_loeschen(text)
to anon, authenticated;

-- ---------- Admin-Passwort festlegen ----------
-- Ersetze DEIN-ADMIN-PASSWORT durch ein langes, eigenes Passwort.
-- Später ändern: nur diese Zeile mit neuem Passwort erneut ausführen.
insert into public.wichtel_einstellungen (id, admin_hash)
values (1, extensions.crypt('DEIN-ADMIN-PASSWORT', extensions.gen_salt('bf')))
on conflict (id) do update set admin_hash = excluded.admin_hash;
