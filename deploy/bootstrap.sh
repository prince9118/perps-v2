#!/usr/bin/env bash
# One-time server setup for a fresh Ubuntu 24.04 VM. Safe to re-run.
# Usage: ssh azureuser@<host> 'bash -s' < deploy/bootstrap.sh <site-address>
set -euo pipefail
SITE_ADDRESS="${1:?usage: bootstrap.sh <site-address>}"
APP_DIR=/opt/perps-v2

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

# Swap gives the box headroom during image pulls and Postgres spikes.
if [ ! -f /swapfile ]; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

sudo mkdir -p "$APP_DIR" /opt/caddy-sites /opt/sites && sudo chown "$USER:$USER" "$APP_DIR" /opt/caddy-sites /opt/sites

# Secrets are generated once on the server and never leave it.
if [ ! -f "$APP_DIR/.env" ]; then
  umask 077
  cat > "$APP_DIR/.env" <<ENV
SITE_ADDRESS=$SITE_ADDRESS
POSTGRES_USER=perps
POSTGRES_DB=perps
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
ENV
fi
echo "bootstrap done: $APP_DIR"
