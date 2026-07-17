-- Enable UUID generation (idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── activities ───────────────────────────────────────────────
-- One row per construction schedule task.
CREATE TABLE IF NOT EXISTS activities (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,
  progress     INTEGER     NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  color        TEXT        NOT NULL DEFAULT '#3498DB',
  parent_id    UUID        REFERENCES activities (id) ON DELETE SET NULL,
  dependencies UUID[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for ordering by schedule date
CREATE INDEX IF NOT EXISTS idx_activities_start_date
  ON activities (start_date ASC);

-- Index for parent-child hierarchy queries
CREATE INDEX IF NOT EXISTS idx_activities_parent_id
  ON activities (parent_id)
  WHERE parent_id IS NOT NULL;

-- ── activity_object_links ────────────────────────────────────
-- Links an activity to one or more IFC GlobalIds.
-- global_id is the stable IFC identifier — NOT a FK to any
-- other table because IFC objects are runtime data, not DB rows.
CREATE TABLE IF NOT EXISTS activity_object_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID        NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  global_id   TEXT        NOT NULL,
  linked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate (activity, object) pairs
  UNIQUE (activity_id, global_id)
);

-- Indexes for the two common query patterns:
--   • Fetch all links for an activity
--   • Fetch all activities for an IFC object
CREATE INDEX IF NOT EXISTS idx_activity_links_activity_id
  ON activity_object_links (activity_id);

CREATE INDEX IF NOT EXISTS idx_activity_links_global_id
  ON activity_object_links (global_id);

-- ── updated_at trigger ───────────────────────────────────────
-- Automatically maintains the updated_at column on activities.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activities_updated_at ON activities;
CREATE TRIGGER activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();