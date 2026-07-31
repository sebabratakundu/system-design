import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'read_scaling_demo.db');

// Initialize real SQLite database
export const db = new Database(dbPath);

// Enable WAL mode for high concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

export function initDatabase() {
  console.log('⚡ Initializing Database Schema & Indexing...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      bio TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_uuid_version ON users(uuid, version);
  `);

  const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

  if (countRow.count < 10000) {
    console.log('🌱 Seeding 10,000 real user records into SQLite (with B-Tree indexes)...');
    
    const insert = db.prepare(`
      INSERT INTO users (uuid, name, email, bio, version) 
      VALUES (?, ?, ?, ?, 1)
    `);

    const insertMany = db.transaction((users: Array<[string, string, string, string]>) => {
      for (const u of users) {
        insert.run(u[0], u[1], u[2], u[3]);
      }
    });

    const seedData: Array<[string, string, string, string]> = [];
    for (let i = 1; i <= 10000; i++) {
      seedData.push([
        `usr_${i}`,
        `User ${i}`,
        `user_${i}@example.com`,
        `Software Engineer #${i}`
      ]);
    }

    insertMany(seedData);
    console.log('✅ Seeding Complete! Total rows: 10,000');
  }
}

export function queryUserByEmail(email: string) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email);
}

export function queryUserByUuid(uuid: string) {
  const stmt = db.prepare('SELECT * FROM users WHERE uuid = ?');
  return stmt.get(uuid);
}

export function updateUserBioAndVersion(uuid: string, newBio: string) {
  const updateStmt = db.prepare(`
    UPDATE users 
    SET bio = ?, version = version + 1 
    WHERE uuid = ?
  `);
  
  const getStmt = db.prepare('SELECT * FROM users WHERE uuid = ?');

  return db.transaction(() => {
    updateStmt.run(newBio, uuid);
    return getStmt.get(uuid);
  })();
}
