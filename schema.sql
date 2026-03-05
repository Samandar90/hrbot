create table if not exists bot_admins (
  user_id bigint primary key
);

create table if not exists vacancies (
  id serial primary key,
  title text not null,
  button_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vacancy_filters (
  id serial primary key,
  vacancy_id int not null references vacancies(id) on delete cascade,
  type text not null, -- age_range | license_bc | no_alcohol
  config jsonb not null default '{}'::jsonb
);

create table if not exists vacancy_questions (
  id serial primary key,
  vacancy_id int not null references vacancies(id) on delete cascade,
  sort int not null default 0,
  q_type text not null, -- text | number | yesno | choice | phone
  text text not null,
  options jsonb not null default '[]'::jsonb,
  required boolean not null default true
);

create table if not exists applications (
  id serial primary key,
  vacancy_id int not null references vacancies(id),
  user_id bigint not null,
  username text,
  full_name text,
  status text not null default 'new', -- new/accepted/reserve/rejected
  created_at timestamptz not null default now(),

  -- premium анкета
  phone text,
  age int,
  experience text,
  shift text,
  start_pref text,
  license text,
  alcohol text
);

create table if not exists application_answers (
  id serial primary key,
  application_id int not null references applications(id) on delete cascade,
  question_id int not null references vacancy_questions(id),
  answer text not null
);

create unique index if not exists ux_app_answers
on application_answers(application_id, question_id);

create table if not exists user_state (
  user_id bigint primary key,
  state text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- indexes
create index if not exists ix_apps_vacancy_created
on applications(vacancy_id, created_at desc);

create index if not exists ix_apps_status_created
on applications(status, created_at desc);

create index if not exists ix_questions_vacancy_sort
on vacancy_questions(vacancy_id, sort asc, id asc);

create index if not exists ix_filters_vacancy
on vacancy_filters(vacancy_id);