-- Optional SQL migration
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, type TEXT, name TEXT, icon TEXT, color TEXT, default_flag BOOLEAN);
CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, type TEXT, amount INTEGER, categoryid TEXT, categoryname TEXT, date TEXT, description TEXT, createdat BIGINT);
CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, week TEXT, kind TEXT, amount INTEGER);
CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, json JSONB);
