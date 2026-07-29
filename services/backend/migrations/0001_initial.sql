CREATE TABLE scan_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL,
  source TEXT NOT NULL,
  ceiling_height_meters REAL NOT NULL CHECK (ceiling_height_meters > 0 AND ceiling_height_meters <= 100),
  status TEXT NOT NULL CHECK (status IN ('created', 'completed')),
  completion_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX idx_scan_sessions_property_id ON scan_sessions(property_id);

CREATE TABLE room_meshes (
  id TEXT PRIMARY KEY NOT NULL,
  scan_session_id TEXT NOT NULL UNIQUE,
  property_id TEXT NOT NULL,
  title TEXT NOT NULL,
  width_meters REAL NOT NULL CHECK (width_meters > 0 AND width_meters <= 100),
  depth_meters REAL NOT NULL CHECK (depth_meters > 0 AND depth_meters <= 100),
  height_meters REAL NOT NULL CHECK (height_meters > 0 AND height_meters <= 100),
  source_asset_name TEXT NOT NULL,
  preview_model_url TEXT,
  capture_engine TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (scan_session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_room_meshes_property_id ON room_meshes(property_id);

CREATE TABLE indoor_viewpoints (
  id TEXT NOT NULL,
  mesh_id TEXT NOT NULL,
  label TEXT NOT NULL,
  yaw_degrees REAL NOT NULL CHECK (yaw_degrees >= -180 AND yaw_degrees <= 180),
  x_meters REAL NOT NULL CHECK (x_meters >= -100 AND x_meters <= 100),
  y_meters REAL NOT NULL CHECK (y_meters >= -100 AND y_meters <= 100),
  position INTEGER NOT NULL,
  PRIMARY KEY (mesh_id, id),
  FOREIGN KEY (mesh_id) REFERENCES room_meshes(id) ON DELETE CASCADE
);

CREATE TABLE furnishing_projects (
  id TEXT PRIMARY KEY NOT NULL,
  mesh_id TEXT NOT NULL,
  style TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (mesh_id) REFERENCES room_meshes(id) ON DELETE CASCADE
);

CREATE INDEX idx_furnishing_projects_mesh_id ON furnishing_projects(mesh_id);

CREATE TABLE furniture_placements (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  furniture_type TEXT NOT NULL,
  x_meters REAL NOT NULL CHECK (x_meters >= -100 AND x_meters <= 100),
  y_meters REAL NOT NULL CHECK (y_meters >= -100 AND y_meters <= 100),
  rotation_degrees REAL NOT NULL CHECK (rotation_degrees >= -360 AND rotation_degrees <= 360),
  position INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES furnishing_projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_furniture_placements_project_id
  ON furniture_placements(project_id, position);
