CREATE TABLE households (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL,
  invited_email TEXT NOT NULL,
  member_id TEXT UNIQUE,
  CHECK (member_id IS NULL OR member_id <> owner_id)
);
--> statement-breakpoint
CREATE INDEX households_invited_email ON households (invited_email);
