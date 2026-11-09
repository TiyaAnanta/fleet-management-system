const { DatabaseSync } = require('node:sqlite'); // built-in, no native build needed
const bcrypt = require('bcryptjs');
const config = require('../config');

function createDb(file = config.dbFile) {
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','operator','driver')),
    phone TEXT
  );
  CREATE TABLE IF NOT EXISTS vehicles(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT UNIQUE NOT NULL,
    model TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    status TEXT NOT NULL DEFAULT 'idle',
    owner_id INTEGER,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS telemetry(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    latitude REAL, longitude REAL,
    speed REAL, battery REAL,
    event TEXT,
    recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS notifications(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    message TEXT NOT NULL,
    reason TEXT,
    vehicle_id INTEGER,
    status TEXT NOT NULL CHECK(status IN ('sent','failed')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);
  // Seed users
  const seed = db.prepare('INSERT OR IGNORE INTO users(username,password_hash,role,phone) VALUES (?,?,?,?)');
  seed.run('admin', bcrypt.hashSync('admin123', 8), 'admin', config.adminPhone);
  seed.run('operator', bcrypt.hashSync('operator123', 8), 'operator', '+910000000001');
  seed.run('driver', bcrypt.hashSync('driver123', 8), 'driver', '+910000000002');
  return db;
}
module.exports = { createDb };
