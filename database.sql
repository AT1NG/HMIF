-- =====================================================
--  HIMA TI VOTE — Database Schema
--  MySQL 5.7+ / MariaDB 10+
--  Jalankan file ini sekali saat setup awal
-- =====================================================

CREATE DATABASE IF NOT EXISTS hima_vote CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hima_vote;

-- ─────────────────────────────────────────
-- Tabel users (akun voter & admin)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,        -- bcrypt hash
  role       ENUM('voter','admin') NOT NULL DEFAULT 'voter',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
-- Tabel divisions (divisi yang bisa dipilih)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS divisions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  icon        VARCHAR(10)  DEFAULT '📌',
  photo_url   VARCHAR(255) DEFAULT NULL,   -- path foto yang diupload
  color       VARCHAR(80)  DEFAULT 'rgba(37,99,235,0.2)',
  fill        VARCHAR(120) DEFAULT 'linear-gradient(90deg,#2563eb,#06b6d4)',
  is_active   TINYINT(1)   DEFAULT 1,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
-- Tabel vote_periods (periode bulanan)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vote_periods (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  label      VARCHAR(50)  NOT NULL,        -- e.g. "April 2025"
  month      TINYINT      NOT NULL,        -- 1-12
  year       SMALLINT     NOT NULL,
  is_active  TINYINT(1)   DEFAULT 1,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_period (month, year)
);

-- ─────────────────────────────────────────
-- Tabel votes (rekaman suara)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS votes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  division_id INT NOT NULL,
  period_id   INT NOT NULL,
  voted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE CASCADE,
  FOREIGN KEY (period_id)   REFERENCES vote_periods(id) ON DELETE CASCADE,
  UNIQUE KEY one_vote_per_period (user_id, period_id)  -- 1 akun 1 suara per periode
);

-- ─────────────────────────────────────────
-- Tabel members (anggota himpunan)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  nim         VARCHAR(30)  NOT NULL UNIQUE,
  division_id INT DEFAULT NULL,
  position    VARCHAR(100) DEFAULT NULL,     -- jabatan, e.g. "Ketua", "Anggota"
  angkatan    SMALLINT DEFAULT NULL,         -- tahun angkatan, e.g. 2022
  email       VARCHAR(150) DEFAULT NULL,
  phone       VARCHAR(30)  DEFAULT NULL,
  photo_url   VARCHAR(255) DEFAULT NULL,
  bio         TEXT,
  is_active   TINYINT(1)   DEFAULT 1,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────
-- Tabel activity_logs
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  actor      VARCHAR(50),
  action     VARCHAR(255),
  color      VARCHAR(20) DEFAULT '#8892b0',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ─────────────────────────────────────────
-- Tabel member_votes (voting untuk anggota)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_votes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  member_id   INT NOT NULL,
  period_id   INT NOT NULL,
  voted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)   REFERENCES users(id)        ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)      ON DELETE CASCADE,
  FOREIGN KEY (period_id) REFERENCES vote_periods(id) ON DELETE CASCADE,
  UNIQUE KEY one_member_vote_per_period (user_id, period_id)  -- 1 akun 1 suara per periode
);

-- =====================================================
-- SEED DATA
-- =====================================================

-- Admin & akun demo voter (password: pass123, admin123 — di-hash saat seed via Node)
-- Akan di-insert oleh script seed.js, bukan di sini langsung
-- karena butuh bcrypt hash

-- Divisi
INSERT IGNORE INTO divisions (slug, name, description, icon, color, fill) VALUES
('eksternal',  'Divisi Eksternal',  'Mengelola hubungan eksternal, kerjasama, dan relasi dengan pihak luar himpunan.', '🌐', 'rgba(37,99,235,0.2)',   'linear-gradient(90deg,#2563eb,#06b6d4)'),
('media',      'Divisi Media',      'Mengelola konten, media sosial, dokumentasi, dan publikasi kegiatan himpunan.',    '📱', 'rgba(168,85,247,0.2)', 'linear-gradient(90deg,#a855f7,#ec4899)'),
('psdm',       'Divisi PSDM',       'Pengembangan sumber daya manusia, pelatihan, dan pembinaan anggota himpunan.',     '🎓', 'rgba(245,158,11,0.2)', 'linear-gradient(90deg,#f59e0b,#ef4444)'),
('minatbakat', 'Divisi Minat Bakat','Memfasilitasi bakat, kompetisi, dan pengembangan potensi anggota di berbagai bidang.','🎯','rgba(34,197,94,0.2)', 'linear-gradient(90deg,#22c55e,#06b6d4)');

-- Periode aktif
INSERT IGNORE INTO vote_periods (label, month, year, is_active) VALUES
('April 2025', 4, 2025, 1);
