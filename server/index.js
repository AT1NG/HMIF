// server/index.js — Entry point Express server
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');
const routes  = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'hima_secret_dev',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000, // 8 jam
  },
}));

// ─────────────────────────────────────────
// Static files (frontend)
// ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ─────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────
app.use('/api', routes);

// ─────────────────────────────────────────
// Serve index.html for all non-API routes (SPA)
// ─────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─────────────────────────────────────────
// Start server
// ─────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║   🎓 HIMA TI VOTE — Server Running   ║');
    console.log(`║   http://localhost:${PORT}               ║`);
    console.log('╚══════════════════════════════════════╝');
    console.log('');
  });
}

module.exports = app;
