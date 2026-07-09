-- ============================================================
-- Migration 001 — Information Layers + Assignments
-- Target: Neon PostgreSQL
-- Run once against your Neon project.
-- ============================================================

-- Enable UUID generation (available in all Neon projects)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── information_layers ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS information_layers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'custom',
  color       TEXT        NOT NULL DEFAULT '#3498DB',
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing layers by creation date
CREATE INDEX IF NOT EXISTS idx_layers_created_at
  ON information_layers (created_at DESC);

-- ── layer_assignments ────────────────────────────────────────
-- Links an IFC GlobalId to one or more information layers.
-- global_id is the stable IFC identifier — NOT a FK to any
-- other table because IFC objects are runtime data, not DB rows.
CREATE TABLE IF NOT EXISTS layer_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id    UUID        NOT NULL REFERENCES information_layers (id) ON DELETE CASCADE,
  global_id   TEXT        NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate (layer, object) pairs
  UNIQUE (layer_id, global_id)
);

-- Indexes for the two common query patterns:
--   • Fetch all assignments for a layer
--   • Fetch all layers for an IFC object
CREATE INDEX IF NOT EXISTS idx_assignments_layer_id
  ON layer_assignments (layer_id);

CREATE INDEX IF NOT EXISTS idx_assignments_global_id
  ON layer_assignments (global_id);