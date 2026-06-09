#!/bin/bash
# ═══════════════════════════════════════════════════════
#  HIMA TI VOTE — Setup HTTPS dengan Let's Encrypt
#  Jalankan SETELAH deploy.sh & domain sudah mengarah ke IP VPS
#  Usage: sudo bash setup-ssl.sh yourdomain.com
# ═══════════════════════════════════════════════════════

DOMAIN=$1
if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash setup-ssl.sh yourdomain.com"
  echo "Contoh: sudo bash setup-ssl.sh vote.himati.ac.id"
  exit 1
fi

echo "🔐 Setup HTTPS untuk domain: $DOMAIN"

# Install certbot
apt-get install -y certbot python3-certbot-nginx -q

# Update nginx config dengan domain
cat > /etc/nginx/sites-available/hima-vote <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 10M;

    location /uploads/ {
        alias /var/www/hima-vote/public/uploads/;
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }

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

# Minta sertifikat SSL
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN

nginx -t && systemctl reload nginx

echo ""
echo "✅ HTTPS aktif!"
echo "   Buka: https://$DOMAIN"
echo ""
echo "   SSL akan auto-renew oleh certbot."
