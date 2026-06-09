#!/bin/bash
# ═══════════════════════════════════════════════════════
#  HIMA TI VOTE — Script Deploy Otomatis VPS
#  Tested: Ubuntu 20.04 / 22.04 / Debian 11 / 12
#  Jalankan sebagai root: sudo bash deploy.sh
# ═══════════════════════════════════════════════════════

set -e   # stop on error

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  🎓 HIMA TI VOTE — VPS Deploy Script    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Cek root ──
if [ "$EUID" -ne 0 ]; then
  err "Jalankan script ini sebagai root: sudo bash deploy.sh"
fi

# ── 2. Deteksi OS ──
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
else
  err "Tidak bisa mendeteksi OS."
fi
log "OS terdeteksi: $OS $VERSION_ID"

# ── 3. Update & install dependencies ──
info "Mengupdate package list..."
apt-get update -q

info "Menginstall curl, git, nginx, unzip..."
apt-get install -y curl git nginx unzip ufw -q

# ── 4. Install Node.js 20 ──
if ! command -v node &>/dev/null; then
  info "Menginstall Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs -q
  log "Node.js $(node -v) terinstall"
else
  log "Node.js sudah ada: $(node -v)"
fi

# ── 5. Install PM2 ──
if ! command -v pm2 &>/dev/null; then
  info "Menginstall PM2..."
  npm install -g pm2 -q
  log "PM2 terinstall"
else
  log "PM2 sudah ada"
fi

# ── 6. Install MySQL ──
if ! command -v mysql &>/dev/null; then
  info "Menginstall MySQL..."
  apt-get install -y mysql-server -q
  systemctl start mysql
  systemctl enable mysql
  log "MySQL terinstall & berjalan"
else
  log "MySQL sudah ada"
fi

# ── 7. Setup app directory ──
APP_DIR="/var/www/hima-vote"
info "Menyiapkan direktori aplikasi di $APP_DIR..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/public/uploads/divisions

# ── 8. Copy file project (asumsikan script dijalankan dari folder project) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
info "Menyalin file dari $SCRIPT_DIR ke $APP_DIR..."
cp -r $SCRIPT_DIR/server   $APP_DIR/
cp -r $SCRIPT_DIR/public   $APP_DIR/
cp    $SCRIPT_DIR/package.json $APP_DIR/
cp    $SCRIPT_DIR/database.sql $APP_DIR/

# Buat .env jika belum ada
if [ ! -f "$APP_DIR/.env" ]; then
  warn "File .env belum ada. Membuat dari template..."
  SESSION_SECRET=$(openssl rand -hex 32)
  cat > $APP_DIR/.env <<EOF
PORT=3000
SESSION_SECRET=$SESSION_SECRET

DB_HOST=localhost
DB_PORT=3306
DB_USER=himavote
DB_PASS=HimaVote2025!
DB_NAME=hima_vote
EOF
  log ".env dibuat dengan session secret acak"
fi

# ── 9. Setup MySQL database & user ──
info "Menyiapkan database MySQL..."
DB_USER="himavote"
DB_PASS="HimaVote2025!"
DB_NAME="hima_vote"

mysql -u root <<MYSQL_SCRIPT
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
MYSQL_SCRIPT

# Import schema
mysql -u $DB_USER -p$DB_PASS $DB_NAME < $APP_DIR/database.sql
log "Database & schema berhasil dibuat"

# ── 10. Install npm packages ──
info "Menginstall npm packages..."
cd $APP_DIR
npm install --production -q
log "npm install selesai"

# ── 11. Seed data awal ──
info "Menjalankan seed data..."
node server/seed.js && log "Seed selesai" || warn "Seed gagal (mungkin sudah ada data)"

# ── 12. Set permissions ──
chown -R www-data:www-data $APP_DIR/public/uploads
chmod -R 755 $APP_DIR/public/uploads
chown -R $(whoami):$(whoami) $APP_DIR

# ── 13. Start dengan PM2 ──
info "Menjalankan aplikasi dengan PM2..."
cd $APP_DIR
pm2 delete hima-vote 2>/dev/null || true
pm2 start server/index.js --name hima-vote --env production
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true
log "Aplikasi berjalan di port 3000"

# ── 14. Setup Nginx ──
info "Mengkonfigurasi Nginx..."
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

cat > /etc/nginx/sites-available/hima-vote <<NGINX
server {
    listen 80;
    server_name $SERVER_IP _;

    # Upload size max 10MB
    client_max_body_size 10M;

    # Static files (foto upload)
    location /uploads/ {
        alias /var/www/hima-vote/public/uploads/;
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }

    # Proxy ke Node.js
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/hima-vote /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
log "Nginx dikonfigurasi & direstart"

# ── 15. Firewall ──
info "Mengatur firewall (UFW)..."
ufw --force enable
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
log "Firewall: port 22, 80, 443 dibuka"

# ── DONE ──
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║       ✅ DEPLOY BERHASIL!                ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐 Buka: ${BOLD}http://$SERVER_IP${NC}"
echo ""
echo -e "  📋 Akun default:"
echo -e "     Admin : ${CYAN}admin${NC} / ${CYAN}admin123${NC}"
echo -e "     Voter : ${CYAN}hima01${NC}–${CYAN}hima10${NC} / ${CYAN}pass123${NC}"
echo ""
echo -e "  🔧 Perintah berguna:"
echo -e "     ${YELLOW}pm2 logs hima-vote${NC}        # lihat log"
echo -e "     ${YELLOW}pm2 restart hima-vote${NC}     # restart app"
echo -e "     ${YELLOW}pm2 status${NC}                # status semua app"
echo -e "     ${YELLOW}systemctl status nginx${NC}    # cek nginx"
echo ""
echo -e "  ⚠️  Catatan keamanan:"
echo -e "     - Ganti password akun admin setelah login pertama"
echo -e "     - Untuk domain + HTTPS, jalankan: ${YELLOW}bash setup-ssl.sh${NC}"
echo ""
