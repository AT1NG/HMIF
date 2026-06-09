# 🎓 HIMA TI VOTE — Sistem Voting Divisi Terbaik

Full-stack dengan **Node.js + Express + MySQL**, foto per divisi, siap deploy ke VPS.

---

## 📁 Struktur Project

```
hima-vote/
├── server/
│   ├── index.js        ← Entry point Express
│   ├── routes.js       ← API + upload foto
│   ├── db.js           ← Koneksi MySQL
│   ├── middleware.js   ← Auth guard
│   └── seed.js         ← Data akun awal
├── public/
│   ├── index.html      ← Frontend SPA
│   └── uploads/divisions/  ← Foto divisi
├── database.sql        ← Schema MySQL
├── package.json
├── deploy.sh           ← 🚀 Auto-deploy VPS
├── setup-ssl.sh        ← HTTPS / domain
└── .env.example
```

---

## 🚀 Deploy ke VPS (1 Perintah)

```bash
# Di komputer lokal: upload project
scp -r hima-vote/ root@IP_VPS:/root/

# SSH ke VPS lalu jalankan:
cd /root/hima-vote
chmod +x deploy.sh
sudo bash deploy.sh
```

Script otomatis install Node.js, MySQL, Nginx, PM2, setup DB, dan start app.

Setelah selesai buka: `http://IP_VPS_KAMU`

### Tambah Domain + HTTPS
```bash
sudo bash setup-ssl.sh vote.himati.ac.id
```

---

## 🖥️ Jalankan Lokal

```bash
cp .env.example .env       # isi DB_PASS
mysql -u root -p < database.sql
npm install
npm run seed
npm start                  # http://localhost:3000
```

---

## 🔐 Akun Default

| Username | Password | Role  |
|----------|----------|-------|
| admin    | admin123 | Admin |
| hima01–hima10 | pass123 | Voter |

> ⚠️ Ganti password admin setelah login pertama!

---

## 🖼️ Upload Foto Divisi

1. Login **admin** → Tab ⚙️ Admin
2. Bagian **"Foto per Divisi"** → klik **📷 Upload**
3. Pilih foto (JPG/PNG/WebP, maks 5MB)
4. Foto langsung tampil di kartu vote & halaman hasil

---

## 🔧 Perintah VPS

```bash
pm2 status                 # status app
pm2 logs hima-vote         # log real-time
pm2 restart hima-vote      # restart
systemctl reload nginx     # reload nginx
```

---

*Built with ❤️ untuk HIMA Teknik Informatika*
