CREATE TABLE account_documents (
  user_id TEXT NOT NULL,
  document_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, document_key)
);
