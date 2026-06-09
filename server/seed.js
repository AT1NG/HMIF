// server/seed.js — Isi data awal akun user
// Jalankan: npm run seed
const bcrypt   = require('bcryptjs');
const db       = require('./db');
require('dotenv').config();

async function seed() {
  console.log('🌱 Menjalankan seed data...\n');

  const accounts = [
    { username: 'admin',  password: 'admin123', role: 'admin' },
    { username: 'hima01', password: 'pass123',  role: 'voter' },
    { username: 'hima02', password: 'pass123',  role: 'voter' },
    { username: 'hima03', password: 'pass123',  role: 'voter' },
    { username: 'hima04', password: 'pass123',  role: 'voter' },
    { username: 'hima05', password: 'pass123',  role: 'voter' },
    { username: 'hima06', password: 'pass123',  role: 'voter' },
    { username: 'hima07', password: 'pass123',  role: 'voter' },
    { username: 'hima08', password: 'pass123',  role: 'voter' },
    { username: 'hima09', password: 'pass123',  role: 'voter' },
    { username: 'hima10', password: 'pass123',  role: 'voter' },
  ];

  for (const acc of accounts) {
    const hash = await bcrypt.hash(acc.password, 10);
    try {
      await db.execute(
        'INSERT IGNORE INTO users (username, password, role) VALUES (?, ?, ?)',
        [acc.username, hash, acc.role]
      );
      console.log(`  ✔ ${acc.username} (${acc.role})`);
    } catch (e) {
      console.log(`  ⚠ ${acc.username} sudah ada, skip.`);
    }
  }

  console.log('\n✅ Seed selesai!');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed gagal:', err);
  process.exit(1);
});
