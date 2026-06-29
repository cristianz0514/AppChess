-- Users
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  chess_username text not null unique,
  created_at timestamptz not null default now()
);

-- Games
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  chess_game_id text not null unique,
  pgn text not null,
  opening text,
  result text check (result in ('win', 'loss', 'draw')),
  white_rating int,
  black_rating int,
  time_control text,
  accuracy numeric(5,2),
  played_as text check (played_as in ('white', 'black')),
  created_at timestamptz not null default now()
);

-- Moves
create table if not exists moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  move_number int not null,
  move text not null,
  evaluation numeric(7,2),
  centipawn_loss int,
  classification text check (classification in ('best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'))
);

-- Insights
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category text check (category in ('opening', 'tactical', 'time_management', 'recurring_blunder')),
  message text not null,
  severity text check (severity in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);

-- Opening stats (denormalized for fast dashboard reads)
create table if not exists opening_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  opening_name text not null,
  games_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  winrate numeric(5,2) not null default 0,
  unique (user_id, opening_name)
);

-- Indexes for common queries
create index if not exists games_user_id_idx on games(user_id);
create index if not exists moves_game_id_idx on moves(game_id);
create index if not exists insights_user_id_idx on insights(user_id);
create index if not exists opening_stats_user_id_idx on opening_stats(user_id);
