// server/db.js — MySQL connection pool
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'hima_vote',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:  'utf8mb4',
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ Database MySQL terhubung');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Gagal koneksi ke database:', err.message);
    process.exit(1);
  });

module.exports = pool;
