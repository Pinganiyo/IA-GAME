-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Games Table
create table if not exists games (
  id text primary key,
  title text not null,
  summary text,
  image text,
  data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Sessions Table
create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  game_id text references games(id) not null,
  status text check (status in ('waiting', 'playing', 'finished')) default 'waiting',
  current_round int default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Players Table
create table if not exists players (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade not null,
  socket_id text,
  name text not null,
  character text,
  status text check (status in ('connected', 'ready', 'disconnected')) default 'connected',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turns/Actions Table
create table if not exists actions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  round_number int not null,
  action_text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) - Optional for now, but good practice
alter table games enable row level security;
alter table sessions enable row level security;
alter table players enable row level security;
alter table actions enable row level security;

-- Create policies to allow public access (since we are using anonymous key for now)
-- In a real app, you'd want stricter policies
create policy "Public games access" on games for select using (true);
create policy "Public sessions access" on sessions for all using (true);
create policy "Public players access" on players for all using (true);
create policy "Public actions access" on actions for all using (true);
