// db.js — Initialisation et schéma de la base de données.
// SQLite via better-sqlite3 : requêtes préparées partout (protection
// native contre les injections SQL), fichier unique facile à sauvegarder.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "espgs.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  license_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',     -- active | suspended
  recovery_secret TEXT NOT NULL,             -- secret dérivé, propre à cette entreprise, pour la récupération hors-ligne
  license_expires_at TEXT,                   -- date ISO d'expiration de la licence ; NULL = licence illimitée
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE, -- NULL pour le rôle 'mere'
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,                        -- mere | gerant | employe
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  UNIQUE(business_id, username)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,        -- sale | stock_movement | login | login_failed | lock | unlock | password_change | password_reset | other
  amount REAL,               -- montant (pour les ventes), utilisé pour les rapports
  payload TEXT,              -- détails JSON libres
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | expired | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_business_date ON activity_logs(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);
`);

// Migration : ajoute license_expires_at si la base existait déjà avant
// l'introduction des licences à durée limitée (colonne absente sur les
// installations plus anciennes).
const bizColumns = db.prepare(`PRAGMA table_info(businesses)`).all().map((c) => c.name);
if (!bizColumns.includes("license_expires_at")) {
  db.exec(`ALTER TABLE businesses ADD COLUMN license_expires_at TEXT`);
}

module.exports = db;
