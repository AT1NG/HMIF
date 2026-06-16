// server/routes.js
const express  = require('express');
const bcrypt   = require('bcryptjs');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const db       = require('./db');
const { requireLogin, requireAdmin } = require('./middleware');

const router = express.Router();

// ═══════════════════════════════════════════
// MULTER — upload foto divisi
// FIX: gunakan memoryStorage + tulis file manual
// supaya req.params.id bisa diakses dengan benar
// ═══════════════════════════════════════════
const uploadDir = path.join(__dirname, '../public/uploads/divisions');
try {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
} catch (err) {
  console.warn('⚠️ Gagal membuat folder upload divisions (read-only filesystem):', err.message);
}

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Format tidak didukung. Gunakan JPG, PNG, atau WebP.'));
};

// Pakai memoryStorage agar req.params sudah tersedia saat kita simpan file
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ═══════════════════════════════════════════
// DIVISIONS — ADD BARU
// POST /api/admin/divisions
// ═══════════════════════════════════════════
router.post('/admin/divisions', requireAdmin, async (req, res) => {
  const actor = req.session.user.username;
  const { name, description, icon, color, fill } = req.body;
  if (!name || !name.trim())
    return res.json({ success: false, message: 'Nama divisi tidak boleh kosong.' });

  // Buat slug dari nama (lowercase, spasi → strip)
  const slug = name.trim().toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50) + '_' + Date.now().toString().slice(-5);

  const colors = [
    { c: 'rgba(37,99,235,0.2)',   f: 'linear-gradient(90deg,#2563eb,#06b6d4)' },
    { c: 'rgba(168,85,247,0.2)', f: 'linear-gradient(90deg,#a855f7,#ec4899)' },
    { c: 'rgba(245,158,11,0.2)', f: 'linear-gradient(90deg,#f59e0b,#ef4444)' },
    { c: 'rgba(34,197,94,0.2)',  f: 'linear-gradient(90deg,#22c55e,#06b6d4)' },
    { c: 'rgba(244,63,94,0.2)',  f: 'linear-gradient(90deg,#f43f5e,#f97316)' },
    { c: 'rgba(6,182,212,0.2)',  f: 'linear-gradient(90deg,#06b6d4,#3b82f6)' },
  ];
  const rndColor = colors[Math.floor(Math.random() * colors.length)];
  const finalColor = color || rndColor.c;
  const finalFill  = fill  || rndColor.f;
  const finalIcon  = (icon || '📌').trim();

  try {
    const [result] = await db.execute(
      'INSERT INTO divisions (slug, name, description, icon, color, fill) VALUES (?, ?, ?, ?, ?, ?)',
      [slug, name.trim(), (description || '').trim(), finalIcon, finalColor, finalFill]
    );
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `➕ Admin menambah divisi baru: "${name.trim()}"`, '#22c55e']
    );
    res.json({ success: true, message: `Divisi "${name.trim()}" berhasil ditambahkan.`, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.json({ success: false, message: 'Slug divisi sudah ada. Coba nama berbeda.' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// DIVISIONS — HAPUS
// DELETE /api/admin/divisions/:id
// ═══════════════════════════════════════════
router.delete('/admin/divisions/:id', requireAdmin, async (req, res) => {
  const divId = req.params.id;
  const actor = req.session.user.username;
  try {
    const [rows] = await db.execute('SELECT name, photo_url FROM divisions WHERE id = ?', [divId]);
    if (!rows.length) return res.json({ success: false, message: 'Divisi tidak ditemukan.' });

    // Hapus foto jika ada
    if (rows[0].photo_url) {
      const oldPath = path.join(__dirname, '../public', rows[0].photo_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await db.execute('DELETE FROM divisions WHERE id = ?', [divId]);
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `🗑️ Admin menghapus divisi: "${rows[0].name}"`, '#f43f5e']
    );
    res.json({ success: true, message: `Divisi "${rows[0].name}" berhasil dihapus.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// MEMBERS — GET ALL
// GET /api/members
// ═══════════════════════════════════════════
router.get('/members', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT m.id, m.name, m.nim, m.position, m.angkatan, m.email, m.phone,
              m.photo_url, m.bio, m.is_active,
              d.id as division_id, d.name as division_name, d.icon as division_icon
       FROM members m
       LEFT JOIN divisions d ON m.division_id = d.id
       ORDER BY d.name ASC, m.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// MEMBERS — TAMBAH
// POST /api/admin/members
// ═══════════════════════════════════════════
router.post('/admin/members', requireAdmin, async (req, res) => {
  const actor = req.session.user.username;
  const { name, nim, division_id, position, angkatan, email, phone, bio } = req.body;
  if (!name || !nim)
    return res.json({ success: false, message: 'Nama dan NIM wajib diisi.' });
  try {
    const [result] = await db.execute(
      'INSERT INTO members (name, nim, division_id, position, angkatan, email, phone, bio) VALUES (?,?,?,?,?,?,?,?)',
      [name.trim(), nim.trim(), division_id || null, position || null,
       angkatan || null, email || null, phone || null, bio || null]
    );
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `👤 Admin menambah anggota: ${name.trim()} (${nim.trim()})`, '#06b6d4']
    );
    res.json({ success: true, message: `Anggota ${name.trim()} berhasil ditambahkan.`, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.json({ success: false, message: 'NIM sudah terdaftar.' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// MEMBERS — IMPORT EXCEL
// POST /api/admin/members/import
// ═══════════════════════════════════════════
router.post('/admin/members/import', requireAdmin, async (req, res) => {
  const actor = req.session.user.username;
  const { members } = req.body;

  if (!members || !Array.isArray(members)) {
    return res.json({ success: false, message: 'Data anggota tidak valid.' });
  }

  try {
    // 1. Get all divisions to match them by name/slug
    const [divisions] = await db.execute('SELECT id, name, slug FROM divisions');
    const divisionMap = {};
    divisions.forEach(d => {
      const normName = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normSlug = d.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
      divisionMap[normName] = d.id;
      divisionMap[normSlug] = d.id;
    });

    // 2. Fetch existing NIMs in members and users for deduplication
    const [existingMembers] = await db.execute('SELECT nim FROM members');
    const [existingUsers] = await db.execute('SELECT username FROM users');

    const existingNims = new Set(existingMembers.map(m => m.nim.trim().toLowerCase()));
    const existingUsernames = new Set(existingUsers.map(u => u.username.trim().toLowerCase()));

    let importedCount = 0;
    let skippedCount = 0;

    // Deduplicate duplicate NIMs inside the spreadsheet array itself
    const seenNimsInSheet = new Set();
    const uniqueMembers = [];

    for (const m of members) {
      if (!m.nim || !m.nama) {
        skippedCount++;
        continue;
      }
      const nimStr = String(m.nim).trim();
      const lowerNim = nimStr.toLowerCase();

      if (seenNimsInSheet.has(lowerNim)) {
        skippedCount++;
        continue;
      }
      seenNimsInSheet.add(lowerNim);
      uniqueMembers.push(m);
    }

    // 3. Process each unique member sequentially in a loop
    for (const m of uniqueMembers) {
      const nameStr = String(m.nama).trim();
      const nimStr = String(m.nim).trim();
      const lowerNim = nimStr.toLowerCase();

      // Check database duplicates
      if (existingNims.has(lowerNim) || existingUsernames.has(lowerNim)) {
        skippedCount++;
        continue;
      }

      // Map division name/slug to id
      const rawDivisi = m.divisi ? String(m.divisi).trim() : '';
      const normDivisi = rawDivisi.toLowerCase().replace(/[^a-z0-9]/g, '');
      const divisionId = divisionMap[normDivisi] || null;

      const positionStr = m.jabatan ? String(m.jabatan).trim() : null;
      const angkatanInt = m.angkatan ? parseInt(m.angkatan) : null;

      try {
        // A. Insert member
        await db.execute(
          'INSERT INTO members (name, nim, division_id, position, angkatan) VALUES (?, ?, ?, ?, ?)',
          [nameStr, nimStr, divisionId, positionStr, angkatanInt]
        );

        // B. Hash password (NIM) and insert user account
        const hash = await bcrypt.hash(nimStr, 10);
        await db.execute(
          'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
          [nimStr, hash, 'voter']
        );

        // Add to our Sets to prevent subsequent rows in the loop matching database status
        existingNims.add(lowerNim);
        existingUsernames.add(lowerNim);

        importedCount++;
      } catch (insertErr) {
        console.error(`Gagal memasukkan data import untuk NIM ${nimStr}:`, insertErr);
        skippedCount++;
      }
    }

    // 4. Log to activity logs
    if (importedCount > 0) {
      await db.execute(
        'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
        [actor, `📥 Admin mengimpor data Excel: Berhasil menambah ${importedCount} anggota & akun baru (${skippedCount} dilewati)`, '#10b981']
      );
    }

    res.json({ success: true, imported: importedCount, skipped: skippedCount });
  } catch (err) {
    console.error('Error saat import excel:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan di server.' });
  }
});

// ═══════════════════════════════════════════
// MEMBERS — EDIT
// PUT /api/admin/members/:id
// ═══════════════════════════════════════════
router.put('/admin/members/:id', requireAdmin, async (req, res) => {
  const memberId = req.params.id;
  const actor = req.session.user.username;
  const { name, nim, division_id, position, angkatan, email, phone, bio } = req.body;
  if (!name || !nim)
    return res.json({ success: false, message: 'Nama dan NIM wajib diisi.' });
  try {
    await db.execute(
      'UPDATE members SET name=?, nim=?, division_id=?, position=?, angkatan=?, email=?, phone=?, bio=? WHERE id=?',
      [name.trim(), nim.trim(), division_id || null, position || null,
       angkatan || null, email || null, phone || null, bio || null, memberId]
    );
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `✏️ Admin mengedit data anggota: ${name.trim()}`, '#a855f7']
    );
    res.json({ success: true, message: `Data ${name.trim()} berhasil diupdate.` });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.json({ success: false, message: 'NIM sudah digunakan anggota lain.' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// MEMBERS — HAPUS
// DELETE /api/admin/members/:id
// ═══════════════════════════════════════════
router.delete('/admin/members/:id', requireAdmin, async (req, res) => {
  const memberId = req.params.id;
  const actor = req.session.user.username;
  try {
    const [rows] = await db.execute('SELECT name, nim, photo_url FROM members WHERE id = ?', [memberId]);
    if (!rows.length) return res.json({ success: false, message: 'Anggota tidak ditemukan.' });
    if (rows[0].photo_url && !rows[0].photo_url.startsWith('/api/')) {
      const fp = path.join(__dirname, '../public', rows[0].photo_url);
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (err) {}
    }
    await db.execute('DELETE FROM members WHERE id = ?', [memberId]);
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `🗑️ Admin menghapus anggota: ${rows[0].name} (${rows[0].nim})`, '#f43f5e']
    );
    res.json({ success: true, message: `Anggota ${rows[0].name} berhasil dihapus.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// MEMBERS — UPLOAD FOTO
// POST /api/admin/members/:id/photo
// ═══════════════════════════════════════════
const memberUploadDir = path.join(__dirname, '../public/uploads/members');
try {
  if (!fs.existsSync(memberUploadDir)) fs.mkdirSync(memberUploadDir, { recursive: true });
} catch (err) {
  console.warn('⚠️ Gagal membuat folder upload members (read-only filesystem):', err.message);
}

router.post('/admin/members/:id/photo', requireAdmin, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) return res.json({ success: false, message: err.message });
    if (!req.file) return res.json({ success: false, message: 'File foto tidak ditemukan.' });

    const memberId = req.params.id;
    const actor    = req.session.user.username;
    const photoUrl = `/api/admin/members/${memberId}/photo`;

    try {
      const [old] = await db.execute('SELECT name FROM members WHERE id = ?', [memberId]);
      if (!old.length) return res.json({ success: false, message: 'Anggota tidak ditemukan.' });

      await db.execute(
        'UPDATE members SET photo_data = ?, photo_mime = ?, photo_url = ? WHERE id = ?',
        [req.file.buffer, req.file.mimetype, photoUrl, memberId]
      );
      await db.execute(
        'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
        [actor, `🖼️ Admin upload foto anggota: ${old[0].name}`, '#06b6d4']
      );
      res.json({ success: true, photo_url: photoUrl, message: 'Foto berhasil diupload!' });
    } catch (dbErr) {
      console.error(dbErr);
      res.status(500).json({ success: false, message: 'Gagal menyimpan foto.' });
    }
  });
});

// GET route to serve member photo from DB
router.get('/admin/members/:id/photo', async (req, res) => {
  try {
    const memberId = req.params.id;
    const [rows] = await db.execute(
      'SELECT photo_data, photo_mime FROM members WHERE id = ?',
      [memberId]
    );
    if (!rows.length || !rows[0].photo_data) {
      return res.status(404).send('Not Found');
    }
    res.setHeader('Content-Type', rows[0].photo_mime || 'image/jpeg');
    res.send(rows[0].photo_data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});



router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.json({ success: false, message: 'Username dan password wajib diisi.' });
  try {
    const [rows] = await db.execute(
      'SELECT id, username, password, role FROM users WHERE username = ?', [username]
    );
    if (!rows.length) return res.json({ success: false, message: 'Username atau password salah.' });
    const user  = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)  return res.json({ success: false, message: 'Username atau password salah.' });
    req.session.user = { id: user.id, username: user.username, role: user.role };
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [user.username, `🔑 ${user.username} login`, '#3b82f6']
    );
    res.json({ success: true, user: { username: user.username, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.post('/auth/logout', requireLogin, async (req, res) => {
  const username = req.session.user.username;
  await db.execute(
    'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
    [username, `🚪 ${username} logout`, '#94a3b8']
  ).catch(() => {});
  req.session.destroy();
  res.json({ success: true });
});

router.get('/auth/me', (req, res) => {
  if (req.session?.user) res.json({ success: true, user: req.session.user });
  else res.json({ success: false });
});

// ═══════════════════════════════════════════
// DIVISIONS — GET
// ═══════════════════════════════════════════

router.get('/divisions', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, slug, name, description, icon, photo_url, color, fill FROM divisions WHERE is_active = 1 ORDER BY id'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// DIVISIONS — EDIT nama / deskripsi / icon
// PUT /api/admin/divisions/:id
// ═══════════════════════════════════════════
router.put('/admin/divisions/:id', requireAdmin, async (req, res) => {
  const divId = req.params.id;
  const actor = req.session.user.username;
  const { name, description, icon } = req.body;

  if (!name || !name.trim())
    return res.json({ success: false, message: 'Nama divisi tidak boleh kosong.' });

  try {
    const [existing] = await db.execute('SELECT id, name FROM divisions WHERE id = ?', [divId]);
    if (!existing.length)
      return res.json({ success: false, message: 'Divisi tidak ditemukan.' });

    await db.execute(
      'UPDATE divisions SET name = ?, description = ?, icon = ? WHERE id = ?',
      [name.trim(), (description || '').trim(), (icon || '📌').trim(), divId]
    );

    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `✏️ Admin mengubah nama divisi: "${existing[0].name}" → "${name.trim()}"`, '#a855f7']
    );

    res.json({ success: true, message: `Divisi "${name.trim()}" berhasil diupdate.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// DIVISIONS — UPLOAD FOTO
// POST /api/admin/divisions/:id/photo
// FIX: memoryStorage + tulis file manual agar req.params tersedia
// ═══════════════════════════════════════════
router.post('/admin/divisions/:id/photo', requireAdmin, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) return res.json({ success: false, message: err.message });
    if (!req.file) return res.json({ success: false, message: 'File foto tidak ditemukan.' });

    const divId = req.params.id;
    const actor = req.session.user.username;
    const photoUrl = `/api/admin/divisions/${divId}/photo`;

    try {
      const [old] = await db.execute('SELECT name FROM divisions WHERE id = ?', [divId]);
      if (!old.length) return res.json({ success: false, message: 'Divisi tidak ditemukan.' });

      await db.execute(
        'UPDATE divisions SET photo_data = ?, photo_mime = ?, photo_url = ? WHERE id = ?',
        [req.file.buffer, req.file.mimetype, photoUrl, divId]
      );
      await db.execute(
        'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
        [actor, `🖼️ Admin upload foto untuk ${old[0].name}`, '#06b6d4']
      );

      res.json({ success: true, photo_url: photoUrl, message: 'Foto berhasil diupload!' });
    } catch (dbErr) {
      console.error(dbErr);
      res.status(500).json({ success: false, message: 'Gagal menyimpan foto.' });
    }
  });
});

// GET route to serve division photo from DB
router.get('/admin/divisions/:id/photo', async (req, res) => {
  try {
    const divId = req.params.id;
    const [rows] = await db.execute(
      'SELECT photo_data, photo_mime FROM divisions WHERE id = ?',
      [divId]
    );
    if (!rows.length || !rows[0].photo_data) {
      return res.status(404).send('Not Found');
    }
    res.setHeader('Content-Type', rows[0].photo_mime || 'image/jpeg');
    res.send(rows[0].photo_data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ═══════════════════════════════════════════
// DIVISIONS — HAPUS FOTO
// DELETE /api/admin/divisions/:id/photo
// ═══════════════════════════════════════════
router.delete('/admin/divisions/:id/photo', requireAdmin, async (req, res) => {
  const divId = req.params.id;
  const actor = req.session.user.username;
  try {
    const [rows] = await db.execute('SELECT name FROM divisions WHERE id = ?', [divId]);
    if (!rows.length) return res.json({ success: false, message: 'Divisi tidak ditemukan.' });

    await db.execute(
      'UPDATE divisions SET photo_url = NULL, photo_data = NULL, photo_mime = NULL WHERE id = ?',
      [divId]
    );
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `🗑️ Admin menghapus foto ${rows[0].name}`, '#f43f5e']
    );
    res.json({ success: true, message: 'Foto berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// PERIODS
// ═══════════════════════════════════════════

router.get('/period/active', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, label, month, year FROM vote_periods WHERE is_active = 1 ORDER BY year DESC, month DESC LIMIT 1'
    );
    if (!rows.length) return res.json({ success: false, message: 'Tidak ada periode aktif.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// VOTES
// ═══════════════════════════════════════════

router.get('/votes/status', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [periods] = await db.execute(
      'SELECT id FROM vote_periods WHERE is_active = 1 ORDER BY year DESC, month DESC LIMIT 1'
    );
    if (!periods.length) return res.json({ success: true, hasVoted: false, voteInfo: null });
    const [rows] = await db.execute(
      `SELECT v.id, d.name as division_name, d.slug, d.icon
       FROM votes v JOIN divisions d ON v.division_id = d.id
       WHERE v.user_id = ? AND v.period_id = ?`,
      [userId, periods[0].id]
    );
    res.json({ success: true, hasVoted: rows.length > 0, voteInfo: rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.post('/votes', requireLogin, async (req, res) => {
  const { division_id } = req.body;
  const userId   = req.session.user.id;
  const username = req.session.user.username;
  if (!division_id) return res.json({ success: false, message: 'Division ID wajib diisi.' });
  try {
    const [periods] = await db.execute('SELECT id FROM vote_periods WHERE is_active = 1 LIMIT 1');
    if (!periods.length) return res.json({ success: false, message: 'Tidak ada periode voting aktif.' });
    const [divs] = await db.execute(
      'SELECT id, name FROM divisions WHERE id = ? AND is_active = 1', [division_id]
    );
    if (!divs.length) return res.json({ success: false, message: 'Divisi tidak ditemukan.' });
    await db.execute(
      'INSERT INTO votes (user_id, division_id, period_id) VALUES (?, ?, ?)',
      [userId, division_id, periods[0].id]
    );
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [username, `✅ ${username} memilih ${divs[0].name}`, '#22c55e']
    );
    res.json({ success: true, message: 'Suara berhasil dicatat!', division: divs[0].name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.json({ success: false, message: 'Kamu sudah memberikan suara di periode ini.' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.get('/votes/results', requireLogin, async (req, res) => {
  try {
    const [periods] = await db.execute(
      'SELECT id, label, month, year FROM vote_periods WHERE is_active = 1 ORDER BY year DESC, month DESC LIMIT 1'
    );
    if (!periods.length) return res.json({ success: true, data: [], period: null, totalVotes: 0 });
    const period = periods[0];
    const [rows] = await db.execute(
      `SELECT d.id, d.slug, d.name, d.icon, d.photo_url, d.color, d.fill,
              COUNT(v.id) AS vote_count
       FROM divisions d
       LEFT JOIN votes v ON d.id = v.division_id AND v.period_id = ?
       WHERE d.is_active = 1 GROUP BY d.id ORDER BY vote_count DESC`,
      [period.id]
    );
    const totalVotes = rows.reduce((sum, r) => sum + parseInt(r.vote_count), 0);
    res.json({ success: true, data: rows, period, totalVotes });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// ADMIN — USERS
// ═══════════════════════════════════════════

router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const [periods] = await db.execute('SELECT id FROM vote_periods WHERE is_active = 1 LIMIT 1');
    const periodId  = periods[0]?.id || 0;
    const [rows] = await db.execute(
      `SELECT u.id, u.username, u.role, u.created_at,
              v.id as vote_id, d.name as voted_division, d.icon as voted_icon
       FROM users u
       LEFT JOIN votes v ON u.id = v.user_id AND v.period_id = ?
       LEFT JOIN divisions d ON v.division_id = d.id
       ORDER BY u.role DESC, u.username ASC`,
      [periodId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.post('/admin/users', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  const actor = req.session.user.username;
  if (!username || !password || !role)
    return res.json({ success: false, message: 'Semua field wajib diisi.' });
  if (!['voter', 'admin'].includes(role))
    return res.json({ success: false, message: 'Role tidak valid.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hash, role]);
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `➕ Admin menambah akun: ${username} (${role})`, '#22c55e']
    );
    res.json({ success: true, message: `Akun ${username} berhasil ditambahkan.` });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.json({ success: false, message: 'Username sudah digunakan.' });
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  const userId  = req.params.id;
  const actorId = req.session.user.id;
  const actor   = req.session.user.username;
  if (parseInt(userId) === actorId)
    return res.json({ success: false, message: 'Tidak bisa menghapus akun sendiri.' });
  try {
    const [rows] = await db.execute('SELECT username, role FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.json({ success: false, message: 'User tidak ditemukan.' });
    if (rows[0].role === 'admin')
      return res.json({ success: false, message: 'Tidak bisa menghapus akun admin lain.' });
    await db.execute('DELETE FROM users WHERE id = ?', [userId]);
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `🗑️ Admin menghapus akun: ${rows[0].username}`, '#f43f5e']
    );
    res.json({ success: true, message: `Akun ${rows[0].username} dihapus.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// ADMIN — PERIOD
// ═══════════════════════════════════════════

router.put('/admin/period', requireAdmin, async (req, res) => {
  const { month, year } = req.body;
  const actor = req.session.user.username;
  if (!month || !year) return res.json({ success: false, message: 'Month dan year wajib diisi.' });
  const monthNames = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];
  const label = `${monthNames[month - 1]} ${year}`;
  try {
    await db.execute('UPDATE vote_periods SET is_active = 0');
    await db.execute(
      `INSERT INTO vote_periods (label, month, year, is_active) VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = 1`,
      [label, month, year]
    );
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, `📅 Periode voting diubah ke ${label}`, '#f59e0b']
    );
    res.json({ success: true, message: `Periode diubah ke ${label}.`, label });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// ADMIN — RESET VOTES
// ═══════════════════════════════════════════

router.delete('/admin/votes/reset', requireAdmin, async (req, res) => {
  const actor = req.session.user.username;
  try {
    const [periods] = await db.execute('SELECT id FROM vote_periods WHERE is_active = 1 LIMIT 1');
    if (periods.length) await db.execute('DELETE FROM votes WHERE period_id = ?', [periods[0].id]);
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, '🔄 Admin mereset semua data voting', '#f43f5e']
    );
    res.json({ success: true, message: 'Semua vote berhasil direset.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// ADMIN — LOGS
// ═══════════════════════════════════════════

router.get('/admin/logs', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT actor, action, color, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// ADMIN — EXPORT
// ═══════════════════════════════════════════

router.get('/admin/export', requireAdmin, async (req, res) => {
  try {
    const [periods] = await db.execute('SELECT id, label FROM vote_periods WHERE is_active = 1 LIMIT 1');
    if (!periods.length) return res.json({ success: false, message: 'Tidak ada periode aktif.' });
    const period = periods[0];
    const [votes] = await db.execute(
      `SELECT d.name as division, COUNT(v.id) as total,
              GROUP_CONCAT(u.username ORDER BY v.voted_at SEPARATOR ', ') as voters
       FROM divisions d
       LEFT JOIN votes v ON d.id = v.division_id AND v.period_id = ?
       LEFT JOIN users u ON v.user_id = u.id
       WHERE d.is_active = 1 GROUP BY d.id ORDER BY total DESC`,
      [period.id]
    );
    const [voterList] = await db.execute(
      `SELECT u.username, d.name as voted_for, v.voted_at
       FROM votes v JOIN users u ON v.user_id = u.id JOIN divisions d ON v.division_id = d.id
       WHERE v.period_id = ? ORDER BY v.voted_at`,
      [period.id]
    );
    res.json({ success: true, period, summary: votes, detail: voterList });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// MEMBER VOTES — STATUS (sudah vote atau belum)
// GET /api/member-votes/status
// ═══════════════════════════════════════════
router.get('/member-votes/status', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [periods] = await db.execute(
      'SELECT id FROM vote_periods WHERE is_active = 1 ORDER BY year DESC, month DESC LIMIT 1'
    );
    if (!periods.length) return res.json({ success: true, hasVoted: false, voteInfo: null });
    const [rows] = await db.execute(
      `SELECT mv.id, m.name as member_name, m.photo_url, m.position,
              d.name as division_name, d.icon as division_icon
       FROM member_votes mv
       JOIN members m ON mv.member_id = m.id
       LEFT JOIN divisions d ON m.division_id = d.id
       WHERE mv.user_id = ? AND mv.period_id = ?`,
      [userId, periods[0].id]
    );
    res.json({ success: true, hasVoted: rows.length > 0, voteInfo: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// MEMBER VOTES — KIRIM SUARA
// POST /api/member-votes
// ═══════════════════════════════════════════
router.post('/member-votes', requireLogin, async (req, res) => {
  const { member_id } = req.body;
  const userId   = req.session.user.id;
  const username = req.session.user.username;
  if (!member_id) return res.json({ success: false, message: 'Member ID wajib diisi.' });
  try {
    const [periods] = await db.execute('SELECT id FROM vote_periods WHERE is_active = 1 LIMIT 1');
    if (!periods.length) return res.json({ success: false, message: 'Tidak ada periode voting aktif.' });
    const [mems] = await db.execute(
      'SELECT id, name FROM members WHERE id = ? AND is_active = 1', [member_id]
    );
    if (!mems.length) return res.json({ success: false, message: 'Anggota tidak ditemukan.' });
    await db.execute(
      'INSERT INTO member_votes (user_id, member_id, period_id) VALUES (?, ?, ?)',
      [userId, member_id, periods[0].id]
    );
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [username, `⭐ ${username} memilih anggota terbaik: ${mems[0].name}`, '#f59e0b']
    );
    res.json({ success: true, message: 'Suara berhasil dicatat!', member: mems[0].name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.json({ success: false, message: 'Kamu sudah memberikan suara anggota di periode ini.' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// MEMBER VOTES — HASIL
// GET /api/member-votes/results
// ═══════════════════════════════════════════
router.get('/member-votes/results', requireLogin, async (req, res) => {
  try {
    const [periods] = await db.execute(
      'SELECT id, label FROM vote_periods WHERE is_active = 1 ORDER BY year DESC, month DESC LIMIT 1'
    );
    if (!periods.length) return res.json({ success: true, data: [], period: null, totalVotes: 0 });
    const period = periods[0];
    const [rows] = await db.execute(
      `SELECT m.id, m.name, m.photo_url, m.position, m.angkatan,
              d.name as division_name, d.icon as division_icon,
              COUNT(mv.id) AS vote_count
       FROM members m
       LEFT JOIN member_votes mv ON m.id = mv.member_id AND mv.period_id = ?
       LEFT JOIN divisions d ON m.division_id = d.id
       WHERE m.is_active = 1
       GROUP BY m.id
       ORDER BY vote_count DESC, m.name ASC`,
      [period.id]
    );
    const totalVotes = rows.reduce((sum, r) => sum + parseInt(r.vote_count), 0);
    res.json({ success: true, data: rows, period, totalVotes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// ADMIN — RESET MEMBER VOTES
// DELETE /api/admin/member-votes/reset
// ═══════════════════════════════════════════
router.delete('/admin/member-votes/reset', requireAdmin, async (req, res) => {
  const actor = req.session.user.username;
  try {
    const [periods] = await db.execute('SELECT id FROM vote_periods WHERE is_active = 1 LIMIT 1');
    if (periods.length) await db.execute('DELETE FROM member_votes WHERE period_id = ?', [periods[0].id]);
    await db.execute(
      'INSERT INTO activity_logs (actor, action, color) VALUES (?, ?, ?)',
      [actor, '🔄 Admin mereset semua data voting anggota', '#f43f5e']
    );
    res.json({ success: true, message: 'Semua vote anggota berhasil direset.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});


module.exports = router;
