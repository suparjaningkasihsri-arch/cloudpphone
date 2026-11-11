# Cloudphone

HP Android virtual yang berjalan di laptop Ubuntu milikmu sendiri, dikelola dan dibuka dari browser. Mirip Redfinger, tetapi mesinnya laptopmu.

```
Browser ──► Dashboard (Vercel + Neon)          daftar mesin, HP, tombol start/stop
                ▲
                │ HTTPS keluar, tiap 2 sampai 15 detik
                │
            Agent (di laptop) ──► Docker ──► Redroid (Android) ◄── ws-scrcpy ◄── Cloudflare Tunnel ◄── Browser (layar HP)
```

Dashboard tidak pernah menghubungi laptop. Agent yang menanyakan perintah ke dashboard, jadi laptop tidak perlu membuka port apa pun.

## Isi folder

| Folder | Fungsi |
| --- | --- |
| `dashboard/` | Aplikasi Next.js untuk Vercel: login, daftar mesin dan HP, tambah mesin, tambah HP, halaman pemutar layar |
| `dashboard/public/agent/agent.py` | Agent di laptop (Python, tanpa dependensi) |
| `dashboard/public/agent/install.sh` | Installer satu baris untuk laptop Ubuntu |

## 1. Deploy dashboard

1. Dorong folder ini ke repositori GitHub.
2. Di Vercel: **Add New Project**, pilih repositori itu, dan atur **Root Directory** ke `dashboard`.
3. Buat database: di project Vercel buka **Storage**, tambahkan **Neon** (Postgres). `DATABASE_URL` terisi otomatis.
4. Tambahkan dua environment variable:
   - `DASHBOARD_PASSWORD`: password login, minimal 16 karakter.
   - `SESSION_SECRET`: hasil `openssl rand -hex 32`.
5. Deploy, lalu buka alamatnya dan masuk. Tabel database dibuat otomatis.

Pastikan domain produksi tidak dilindungi Vercel Authentication, karena agent di laptop tidak bisa login lewat SSO.

## 2. Pasang mesin

1. Di dashboard klik **Tambah mesin**, beri nama.
2. Salin perintah yang muncul dan jalankan di laptop Ubuntu. Bentuknya:
   ```
   curl -fsSL https://alamat-dashboard/agent/install.sh | sudo bash -s -- --server https://alamat-dashboard --token cpm_...
   ```
3. Installer memasang Docker, adb, agent (service `cloudphone-agent`), dan ws-scrcpy (service `cloudphone-stream`). Dialog di dashboard berubah saat mesin terhubung.

Matikan sleep di laptop (`Settings > Power`, dan atur "saat tutup layar" ke tidak melakukan apa-apa), karena mesin harus menyala terus.

## 3. Buat HP

Klik **HP baru** pada mesin, pilih versi Android dan ukuran layar. Pertama kali, image Android diunduh (sekitar 1 GB), jadi tunggu beberapa menit. Status berubah menjadi **Menyala** setelah selesai.

## 4. Buka layar di browser

ws-scrcpy berjalan di `http://localhost:8000` di laptop dan hanya menerima koneksi dari laptop itu sendiri. Agar bisa dibuka dari browser lain, buat tunnel:

1. Pasang `cloudflared` (lihat dokumentasi Cloudflare) dan buat named tunnel yang mengarah ke `http://localhost:8000`, misalnya `hp1.domainmu.com`.
2. **Wajib** pasang Cloudflare Access di hostname itu (Zero Trust > Access > Applications), dan izinkan hanya email kamu. ws-scrcpy tidak punya login sendiri: siapa pun yang bisa membukanya bisa mengendalikan HP.
3. Di dashboard buka pengaturan mesin (ikon gerigi) dan isi **Stream URL** dengan `https://hp1.domainmu.com`.

Letakkan dashboard dan tunnel di domain yang sama (misalnya `cp.domainmu.com` untuk Vercel dan `hp1.domainmu.com` untuk tunnel). Dengan begitu cookie login Cloudflare Access tetap terbaca di dalam iframe. Jika beda domain, browser sering memblokirnya dan layar kosong; tombol **Buka di tab baru** tetap bisa dipakai.

Alternatif tanpa Cloudflare: `tailscale serve --https=443 localhost:8000` memberi alamat `https://nama-laptop.tailnet.ts.net` yang hanya terbuka untuk perangkat di Tailscale-mu. Isi alamat itu sebagai Stream URL.

## Keamanan

- Dashboard bisa menyuruh laptop menjalankan container `--privileged`. Karena itu: password panjang, jangan dipakai di tempat lain, dan jaga `SESSION_SECRET`.
- Login dibatasi 8 percobaan gagal per 15 menit per IP.
- Agent hanya menerima lima jenis perintah (buat, nyalakan, matikan, mulai ulang, hapus), hanya memakai image Redroid dari daftar putih di `agent.py`, dan memvalidasi semua parameter. Server tidak bisa menyuruhnya menjalankan perintah lain.
- Port adb setiap HP hanya terikat ke `127.0.0.1`, tidak terlihat dari jaringan.
- Service `cloudphone-stream` dibatasi systemd agar hanya bisa berkomunikasi lewat localhost.
- Token mesin disimpan sebagai hash di database. Token yang hilang diganti lewat pengaturan mesin.
- Ganti `SESSION_SECRET` untuk mengeluarkan semua sesi login sekaligus.

## Pemecahan masalah

**HP langsung berhenti atau status "Restart terus".** Android butuh binder di kernel. Cek `grep binder /proc/filesystems`. Jika kosong, coba `sudo modprobe binder_linux devices=binder,hwbinder,vndbinder`. Jika modul tidak ada, pakai kernel Ubuntu yang menyertakannya (`linux-modules-extra-$(uname -r)`), atau gunakan Waydroid. Jika `modprobe` gagal tetapi `/proc/filesystems` memuat `binder`, binder sudah tersedia bawaan kernel dan tidak perlu apa-apa lagi.

**Mesin tidak pernah online.** Lihat `sudo journalctl -u cloudphone-agent -f`. Penyebab umum: token salah (HTTP 401), atau domain Vercel dilindungi Vercel Authentication.

**ws-scrcpy gagal terpasang.** Butuh Node.js 16 atau lebih baru dan `build-essential`. Lihat `sudo journalctl -u cloudphone-stream -f`. ws-scrcpy sudah lama tidak diperbarui, jadi pada Node versi sangat baru build-nya bisa gagal. Gunakan Node 18 atau 20, atau ganti dengan layanan streaming lain dan isi Stream URL ke alamatnya.

**Layar tidak muncul di dashboard tetapi HP berstatus Menyala.** Buka **Buka di tab baru**. Jika tampil di sana, masalahnya cookie lintas domain di iframe (lihat bagian 4). Jika tidak tampil, cek apakah `adb devices` di laptop memuat `127.0.0.1:5555` dan sejenisnya.

**HP tertinggal di laptop setelah mesin dihapus dari dashboard.** `docker ps -a --filter label=cloudphone`, lalu `docker rm -f <nama>`. Data HP ada di `/var/lib/cloudphone`.

**Biaya dan kuota.** Saat dashboard terbuka, agent menghubungi Vercel tiap 2 detik; saat tertutup, tiap 15 detik. Satu mesin sekitar 250 ribu pemanggilan fungsi per bulan jika dashboard jarang dibuka. Batasi jumlah mesin jika memakai paket gratis.

## Mencopot pemasangan

```
curl -fsSL https://alamat-dashboard/agent/install.sh | sudo bash -s -- --uninstall           # agent saja
curl -fsSL https://alamat-dashboard/agent/install.sh | sudo bash -s -- --uninstall --purge   # plus semua HP dan datanya
```

## Pengembangan lokal

```
cd dashboard
cp .env.example .env.local     # isi DATABASE_URL, DASHBOARD_PASSWORD, SESSION_SECRET
npm install
npm run dev
```

Proyek memakai Next.js 14 (App Router) dan Tailwind 3.
