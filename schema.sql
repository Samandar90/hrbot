-- schema.sql (FINAL)
-- HR bot database schema (PostgreSQL)

-- =========================
-- VACANCIES
-- =========================
create table if not exists vacancies (
  id serial primary key,
  title text not null,
  button_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ix_vacancies_active
on vacancies(is_active);

-- =========================
-- QUESTIONS (per vacancy)
-- =========================
create table if not exists vacancy_questions (
  id serial primary key,
  vacancy_id int not null references vacancies(id) on delete cascade,
  sort int not null default 0,

  q_type text not null,                       -- choice | yesno | text | number | phone
  text text not null,

  options jsonb not null default '[]'::jsonb, -- for choice
  correct_answer jsonb,                       -- null = no auto-check
  points int not null default 1,              -- points for correct
  is_scored boolean not null default true,    -- count in scoring or not
  required boolean not null default true,

  created_at timestamptz not null default now()
);

create index if not exists ix_vq_vacancy_sort
on vacancy_questions(vacancy_id, sort, id);

-- =========================
-- APPLICATIONS (candidate submissions)
-- =========================
create table if not exists applications (
  id serial primary key,
  vacancy_id int not null references vacancies(id) on delete restrict,

  user_id bigint not null,
  username text,
  full_name text,

  name text,
  phone text,

  status text not null default 'draft',       -- draft/new/accepted/reserve/rejected

  score_total int not null default 0,
  score_correct int not null default 0,
  score_wrong int not null default 0,

  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ix_apps_vacancy
on applications(vacancy_id);

create index if not exists ix_apps_status_created
on applications(status, created_at desc);

create index if not exists ix_apps_user
on applications(user_id, created_at desc);

-- =========================
-- ANSWERS (per application)
-- =========================
create table if not exists application_answers (
  id serial primary key,
  application_id int not null references applications(id) on delete cascade,
  question_id int not null references vacancy_questions(id) on delete cascade,

  answer text not null,

  is_correct boolean,
  points int not null default 0,

  created_at timestamptz not null default now()
);

create unique index if not exists ux_app_answers
on application_answers(application_id, question_id);

create index if not exists ix_answers_app
on application_answers(application_id);

-- =========================
-- USER STATE (FSM)
-- =========================
create table if not exists user_state (
  user_id bigint primary key,
  state text not null default 'idle',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists ix_user_state_updated
on user_state(updated_at desc);