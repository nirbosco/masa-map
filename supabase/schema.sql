-- מפת המסע שלי · סכמה בפרויקט hotamnemi, קידומת masa_
-- מותר להריץ שוב (אידמפוטנטי). כל הגישה מהדפדפן דרך פונקציות RPC, אין גישה ישירה לטבלאות.

create extension if not exists pgcrypto;

create table if not exists masa_config (k text primary key, v text not null);

create table if not exists masa_workshops (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  admin_key text not null default encode(gen_random_bytes(12), 'hex'),
  allow_chat boolean not null default true,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists masa_participants (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references masa_workshops(id) on delete cascade,
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  name text not null,
  form text not null default 'f' check (form in ('f','m')),
  step text not null default 'story',
  mode text,
  stations jsonb not null default '[]',
  extras jsonb not null default '{}',
  chat jsonb not null default '[]',
  map_text jsonb,
  summary jsonb,
  world text, style text, mood text, notes text,
  map_status text not null default 'none',
  map_path text,
  map_versions jsonb not null default '[]',
  check_result jsonb,
  attempts int not null default 0,
  fixes int not null default 0,
  error text,
  print_status text not null default 'none',
  status_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists masa_participants_ws on masa_participants(workshop_id);
create index if not exists masa_participants_status on masa_participants(map_status);

alter table masa_config enable row level security;
alter table masa_workshops enable row level security;
alter table masa_participants enable row level security;
revoke all on masa_config, masa_workshops, masa_participants from anon, authenticated;

-- ===== סדנה =====
create or replace function masa_create_workshop(p_master text, p_name text, p_allow_chat boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare v_code text; w masa_workshops;
begin
  if p_master is null or p_master <> (select v from masa_config where k = 'master') then
    raise exception 'not allowed';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  loop
    v_code := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    exit when not exists (select 1 from masa_workshops where code = v_code);
  end loop;
  insert into masa_workshops(code, name, allow_chat) values (v_code, trim(p_name), coalesce(p_allow_chat, true)) returning * into w;
  return json_build_object('code', w.code, 'admin_key', w.admin_key, 'name', w.name);
end $$;

create or replace function masa_list_workshops(p_master text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_master is null or p_master <> (select v from masa_config where k = 'master') then raise exception 'not allowed'; end if;
  return coalesce((select json_agg(json_build_object('code', code, 'name', name, 'admin_key', admin_key, 'created_at', created_at,
    'count', (select count(*) from masa_participants p where p.workshop_id = w.id)) order by created_at desc) from masa_workshops w), '[]'::json);
end $$;

create or replace function masa_workshop_info(p_code text)
returns json language sql security definer set search_path = public as $$
  select json_build_object('name', name, 'allow_chat', allow_chat, 'is_open', is_open) from masa_workshops where code = p_code;
$$;

-- ===== משתתפת =====
create or replace function masa_join(p_code text, p_name text, p_form text)
returns json language plpgsql security definer set search_path = public as $$
declare w masa_workshops; p masa_participants;
begin
  select * into w from masa_workshops where code = p_code;
  if w.id is null then raise exception 'no workshop'; end if;
  if not w.is_open then raise exception 'closed'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  insert into masa_participants(workshop_id, name, form, mode)
    values (w.id, left(trim(p_name), 40), case when p_form = 'm' then 'm' else 'f' end, case when w.allow_chat then null else 'build' end)
    returning * into p;
  return json_build_object('token', p.token);
end $$;

create or replace function masa_me(p_token text)
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'name', p.name, 'form', p.form, 'step', p.step, 'mode', p.mode,
    'stations', p.stations, 'extras', p.extras, 'chat', p.chat, 'map_text', p.map_text, 'summary', p.summary,
    'world', p.world, 'style', p.style, 'mood', p.mood, 'notes', p.notes,
    'map_status', p.map_status, 'has_map', p.map_path is not null, 'error', p.error,
    'workshop', json_build_object('name', w.name, 'allow_chat', w.allow_chat, 'code', w.code))
  from masa_participants p join masa_workshops w on w.id = p.workshop_id where p.token = p_token;
$$;

create or replace function masa_save(p_token text, p_patch jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare p masa_participants;
begin
  select * into p from masa_participants where token = p_token;
  if p.id is null then raise exception 'not found'; end if;
  update masa_participants set
    stations = case when p_patch ? 'stations' then p_patch->'stations' else stations end,
    extras   = case when p_patch ? 'extras' then p_patch->'extras' else extras end,
    map_text = case when p_patch ? 'map_text' then p_patch->'map_text' else map_text end,
    mode  = case when p_patch ? 'mode' then p_patch->>'mode' else mode end,
    step  = case when p_patch ? 'step' then p_patch->>'step' else step end,
    form  = case when p_patch->>'form' in ('f','m') then p_patch->>'form' else form end,
    world = case when p_patch ? 'world' then left(p_patch->>'world', 40) else world end,
    style = case when p_patch ? 'style' then left(p_patch->>'style', 40) else style end,
    mood  = case when p_patch ? 'mood' then left(p_patch->>'mood', 40) else mood end,
    notes = case when p_patch ? 'notes' then left(p_patch->>'notes', 200) else notes end,
    updated_at = now()
  where id = p.id;
  return json_build_object('ok', true);
end $$;

-- ===== מפעיל: רואה רק את טקסט המפה, לא את הסיפור =====
create or replace function masa_admin_list(p_admin text)
returns json language plpgsql security definer set search_path = public as $$
declare w masa_workshops;
begin
  select * into w from masa_workshops where admin_key = p_admin;
  if w.id is null then raise exception 'not allowed'; end if;
  return json_build_object(
    'workshop', json_build_object('name', w.name, 'code', w.code, 'allow_chat', w.allow_chat, 'is_open', w.is_open),
    'people', coalesce((select json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'step', p.step, 'map_status', p.map_status, 'print_status', p.print_status,
        'map_text', p.map_text, 'check_result', p.check_result, 'world', p.world, 'style', p.style,
        'has_map', p.map_path is not null, 'attempts', p.attempts, 'error', p.error,
        'status_at', p.status_at, 'created_at', p.created_at, 'token', p.token) order by p.created_at)
      from masa_participants p where p.workshop_id = w.id), '[]'::json));
end $$;

create or replace function masa_admin_update(p_admin text, p_id uuid, p_patch jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare w masa_workshops;
begin
  select * into w from masa_workshops where admin_key = p_admin;
  if w.id is null then raise exception 'not allowed'; end if;
  update masa_participants set
    print_status = case when p_patch->>'print_status' in ('none','approved','printed') then p_patch->>'print_status' else print_status end,
    map_text = case when p_patch ? 'map_text' then p_patch->'map_text' else map_text end,
    updated_at = now()
  where id = p_id and workshop_id = w.id;
  return json_build_object('ok', true);
end $$;

create or replace function masa_admin_delete(p_admin text, p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare w masa_workshops;
begin
  select * into w from masa_workshops where admin_key = p_admin;
  if w.id is null then raise exception 'not allowed'; end if;
  delete from masa_participants where id = p_id and workshop_id = w.id;
  return json_build_object('ok', true);
end $$;

create or replace function masa_admin_workshop(p_admin text, p_patch jsonb)
returns json language plpgsql security definer set search_path = public as $$
begin
  update masa_workshops set
    is_open = coalesce((p_patch->>'is_open')::boolean, is_open),
    allow_chat = coalesce((p_patch->>'allow_chat')::boolean, allow_chat)
  where admin_key = p_admin;
  return json_build_object('ok', found);
end $$;

-- ===== תור יצירה (נקרא רק מפונקציית השרת) =====
create or replace function masa_claim(p_max int)
returns setof masa_participants language plpgsql security definer set search_path = public as $$
begin
  -- נעילה אחת לתור כולו: אין שתי הקצאות במקביל
  perform pg_advisory_xact_lock(424242);
  -- ריצה שלא סיימה ב-170 שניות נקטעה (מגבלת הפונקציה 150), חוזרת לתור
  update masa_participants set map_status = 'queued', status_at = now(), error = 'נקטע, חוזר לתור'
    where map_status = 'generating' and status_at < now() - interval '170 seconds';
  update masa_participants set map_status = 'ready'
    where map_status in ('checking','fixing') and status_at < now() - interval '3 minutes';
  if (select count(*) from masa_participants where map_status = 'generating') >= p_max then return; end if;
  return query
    update masa_participants set map_status = 'generating', status_at = now(), attempts = attempts + 1
    where id = (select id from masa_participants where map_status = 'queued' order by created_at limit 1 for update skip locked)
    returning *;
end $$;

revoke all on function masa_claim(int) from anon, authenticated, public;
grant execute on function masa_create_workshop(text,text,boolean), masa_list_workshops(text), masa_workshop_info(text),
  masa_join(text,text,text), masa_me(text), masa_save(text,jsonb), masa_admin_list(text),
  masa_admin_update(text,uuid,jsonb), masa_admin_delete(text,uuid), masa_admin_workshop(text,jsonb) to anon, authenticated;

insert into storage.buckets (id, name, public) values ('masa-maps', 'masa-maps', false) on conflict (id) do nothing;

-- ===== גרסה 1.1: אישור משתתפת ודיווח טעות =====
alter table masa_participants add column if not exists approved boolean not null default false;
alter table masa_participants add column if not exists typo_note text;

create or replace function masa_flag(p_token text, p_approved boolean, p_typo text)
returns json language plpgsql security definer set search_path = public as $$
begin
  update masa_participants set approved = coalesce(p_approved, approved),
    typo_note = case when p_typo is null then typo_note else nullif(left(trim(p_typo), 200), '') end,
    updated_at = now()
  where token = p_token;
  return json_build_object('ok', found);
end $$;
grant execute on function masa_flag(text, boolean, text) to anon, authenticated;

create or replace function masa_me(p_token text)
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'name', p.name, 'form', p.form, 'step', p.step, 'mode', p.mode,
    'stations', p.stations, 'extras', p.extras, 'chat', p.chat, 'map_text', p.map_text, 'summary', p.summary,
    'world', p.world, 'style', p.style, 'mood', p.mood, 'notes', p.notes,
    'map_status', p.map_status, 'has_map', p.map_path is not null, 'error', p.error,
    'maps', (select count(*) from jsonb_array_elements(p.map_versions) v where v->>'kind' = 'gen'),
    'approved', p.approved, 'typo_note', p.typo_note,
    'workshop', json_build_object('name', w.name, 'allow_chat', w.allow_chat, 'code', w.code))
  from masa_participants p join masa_workshops w on w.id = p.workshop_id where p.token = p_token;
$$;

create or replace function masa_admin_list(p_admin text)
returns json language plpgsql security definer set search_path = public as $$
declare w masa_workshops;
begin
  select * into w from masa_workshops where admin_key = p_admin;
  if w.id is null then raise exception 'not allowed'; end if;
  return json_build_object(
    'workshop', json_build_object('name', w.name, 'code', w.code, 'allow_chat', w.allow_chat, 'is_open', w.is_open),
    'people', coalesce((select json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'step', p.step, 'map_status', p.map_status, 'print_status', p.print_status,
        'map_text', p.map_text, 'check_result', p.check_result, 'world', p.world, 'style', p.style,
        'has_map', p.map_path is not null, 'attempts', p.attempts, 'error', p.error,
        'approved', p.approved, 'typo_note', p.typo_note,
        'status_at', p.status_at, 'created_at', p.created_at) order by p.created_at)
      from masa_participants p where p.workshop_id = w.id), '[]'::json));
end $$;

-- ===== גרסה 1.2: עריכת סדנה קיימת מעמוד הניהול =====
create or replace function masa_list_workshops(p_master text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_master is null or p_master <> (select v from masa_config where k = 'master') then raise exception 'not allowed'; end if;
  return coalesce((select json_agg(json_build_object('code', code, 'name', name, 'admin_key', admin_key, 'created_at', created_at,
    'allow_chat', allow_chat, 'is_open', is_open,
    'count', (select count(*) from masa_participants p where p.workshop_id = w.id)) order by created_at desc) from masa_workshops w), '[]'::json);
end $$;

create or replace function masa_edit_workshop(p_master text, p_code text, p_patch jsonb)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_master is null or p_master <> (select v from masa_config where k = 'master') then raise exception 'not allowed'; end if;
  if p_patch ? 'name' and coalesce(trim(p_patch->>'name'), '') = '' then raise exception 'name required'; end if;
  update masa_workshops set
    name = coalesce(left(trim(p_patch->>'name'), 60), name),
    is_open = coalesce((p_patch->>'is_open')::boolean, is_open),
    allow_chat = coalesce((p_patch->>'allow_chat')::boolean, allow_chat)
  where code = p_code;
  return json_build_object('ok', found);
end $$;
grant execute on function masa_edit_workshop(text, text, jsonb) to anon, authenticated;

-- ===== גרסה 1.3: המפעיל שולח למשתתף את הלינק האישי =====
create or replace function masa_admin_me_token(p_admin text, p_id uuid)
returns text language sql security definer set search_path = public as $$
  select p.token from masa_participants p join masa_workshops w on w.id = p.workshop_id
  where w.admin_key = p_admin and p.id = p_id;
$$;
grant execute on function masa_admin_me_token(text, uuid) to anon, authenticated;
