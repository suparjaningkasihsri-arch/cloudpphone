#!/usr/bin/env bash
# Installer agent Cloudphone untuk Ubuntu/Debian.
#
#   curl -fsSL https://DASHBOARD/agent/install.sh | sudo bash -s -- --server https://DASHBOARD --token cpm_xxx
#
# Opsi: --no-stream (lewati ws-scrcpy), --uninstall, --purge (dengan --uninstall: hapus juga HP dan datanya)
set -euo pipefail

SERVER=""
TOKEN=""
WITH_STREAM=1
UNINSTALL=0
PURGE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --no-stream) WITH_STREAM=0; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --purge) PURGE=1; shift ;;
    *) echo "Opsi tidak dikenal: $1" >&2; exit 1 ;;
  esac
done

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo." >&2
  exit 1
fi

# ------------------------------------------------------------------ uninstall
if [ "$UNINSTALL" -eq 1 ]; then
  say "Menghapus agent"
  systemctl disable --now cloudphone-agent cloudphone-stream 2>/dev/null || true
  rm -f /etc/systemd/system/cloudphone-agent.service /etc/systemd/system/cloudphone-stream.service
  systemctl daemon-reload
  rm -rf /opt/cloudphone /etc/cloudphone
  if [ "$PURGE" -eq 1 ]; then
    if command -v docker >/dev/null 2>&1; then
      docker ps -aq --filter label=cloudphone | xargs -r docker rm -f
    fi
    rm -rf /var/lib/cloudphone /opt/ws-scrcpy
    rm -f /etc/modules-load.d/cloudphone.conf /etc/modprobe.d/cloudphone-binder.conf
    userdel cloudphone 2>/dev/null || true
    ok "Agent, HP, dan datanya sudah dihapus"
  else
    ok "Agent dihapus. HP dan datanya dibiarkan (tambahkan --purge untuk menghapusnya)"
  fi
  exit 0
fi

# ------------------------------------------------------------------- validasi
SERVER="${SERVER%/}"
if ! [[ "$SERVER" =~ ^https?://[A-Za-z0-9._:-]+(/[A-Za-z0-9._/-]*)?$ ]]; then
  echo "--server tidak valid. Contoh: --server https://cloudphone.vercel.app" >&2
  exit 1
fi
if ! [[ "$TOKEN" =~ ^cpm_[0-9a-f]{48}$ ]]; then
  echo "--token tidak valid. Salin ulang perintah dari dashboard." >&2
  exit 1
fi
if ! command -v apt-get >/dev/null 2>&1; then
  echo "Installer ini hanya mendukung Ubuntu/Debian (apt)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------------------- paket
say "Memasang Docker, adb, dan Python"
apt-get update -y
apt-get install -y docker.io adb python3 curl ca-certificates git
apt-get install -y "linux-modules-extra-$(uname -r)" >/dev/null 2>&1 || true
systemctl enable --now docker
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ------------------------------------------------------------------- binder
say "Memeriksa dukungan binder (dibutuhkan Android)"
binder_ok() {
  grep -qw binder /proc/filesystems 2>/dev/null || [ -e /dev/binderfs ] || [ -e /dev/binder ]
}
if ! binder_ok; then
  modprobe binder_linux devices=binder,hwbinder,vndbinder 2>/dev/null || true
fi
if binder_ok; then
  ok "Binder tersedia"
  if lsmod | grep -q '^binder_linux'; then
    echo "binder_linux" > /etc/modules-load.d/cloudphone.conf
    echo "options binder_linux devices=binder,hwbinder,vndbinder" > /etc/modprobe.d/cloudphone-binder.conf
    ok "Modul binder akan dimuat otomatis saat boot"
  fi
else
  warn "Kernel ini belum punya binder, HP tidak akan menyala. Lihat README bagian pemecahan masalah."
fi

# -------------------------------------------------------------------- agent
say "Memasang agent"
mkdir -p /opt/cloudphone /etc/cloudphone /var/lib/cloudphone
curl -fsSL "$SERVER/agent/agent.py" -o /opt/cloudphone/agent.py
chmod 755 /opt/cloudphone/agent.py

umask 077
printf '{"server": "%s", "token": "%s"}\n' "$SERVER" "$TOKEN" > /etc/cloudphone/agent.json
umask 022

cat > /etc/systemd/system/cloudphone-agent.service <<'UNIT'
[Unit]
Description=Cloudphone agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/cloudphone/agent.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable cloudphone-agent >/dev/null 2>&1
systemctl restart cloudphone-agent
ok "Agent berjalan (lihat log: journalctl -u cloudphone-agent -f)"

# ---------------------------------------------------------------- ws-scrcpy
STREAM_OK=0
if [ "$WITH_STREAM" -eq 1 ]; then
  say "Memasang ws-scrcpy (layar HP di browser)"
  node_major() {
    if command -v node >/dev/null 2>&1; then
      node -p 'process.versions.node.split(".")[0]'
    else
      echo 0
    fi
  }
  NODE_MAJOR="$(node_major)"
  if [ "$NODE_MAJOR" -lt 16 ]; then
    apt-get install -y nodejs npm >/dev/null 2>&1 || true
    NODE_MAJOR="$(node_major)"
  fi
  if [ "$NODE_MAJOR" -lt 16 ]; then
    warn "Butuh Node.js 16 atau lebih baru (terdeteksi: $NODE_MAJOR). Pasang Node.js, lalu jalankan ulang perintah ini."
  else
    apt-get install -y build-essential >/dev/null 2>&1 || true
    id cloudphone >/dev/null 2>&1 || useradd --system --home-dir /opt/ws-scrcpy --shell /usr/sbin/nologin cloudphone
    if [ ! -d /opt/ws-scrcpy/.git ]; then
      git clone --depth 1 https://github.com/NetrisTV/ws-scrcpy.git /opt/ws-scrcpy
    fi
    chown -R cloudphone:cloudphone /opt/ws-scrcpy

    NODE_OPTS=""
    if [ "$NODE_MAJOR" -ge 17 ]; then
      NODE_OPTS="--openssl-legacy-provider"
    fi

    if runuser -u cloudphone -- env HOME=/opt/ws-scrcpy NODE_OPTIONS="$NODE_OPTS" npm --prefix /opt/ws-scrcpy install; then
      NPM_BIN="$(command -v npm)"
      # Hanya boleh menerima dan mengirim lewat localhost: tunnel (cloudflared) berjalan di mesin yang sama.
      cat > /etc/systemd/system/cloudphone-stream.service <<UNIT
[Unit]
Description=Cloudphone stream (ws-scrcpy)
After=network.target cloudphone-agent.service

[Service]
User=cloudphone
WorkingDirectory=/opt/ws-scrcpy
Environment=HOME=/opt/ws-scrcpy
Environment=NODE_OPTIONS=$NODE_OPTS
ExecStart=$NPM_BIN start
Restart=always
RestartSec=5
IPAddressDeny=any
IPAddressAllow=localhost

[Install]
WantedBy=multi-user.target
UNIT
      systemctl daemon-reload
      systemctl enable cloudphone-stream >/dev/null 2>&1
      systemctl restart cloudphone-stream
      STREAM_OK=1
      ok "ws-scrcpy berjalan di http://localhost:8000 (hanya bisa diakses dari laptop ini)"
    else
      warn "npm install ws-scrcpy gagal. Agent tetap berjalan; lihat README bagian pemecahan masalah."
    fi
  fi
fi

# ------------------------------------------------------------------ ringkasan
say "Selesai"
echo "  Kembali ke dashboard: mesin akan muncul online dalam beberapa detik."
if [ "$STREAM_OK" -eq 1 ]; then
  echo
  echo "  Langkah berikutnya agar layar bisa dibuka dari browser: buat Cloudflare Tunnel"
  echo "  yang mengarah ke http://localhost:8000, lalu isi Stream URL di pengaturan mesin."
  echo "  Percobaan cepat:  cloudflared tunnel --url http://localhost:8000"
fi
