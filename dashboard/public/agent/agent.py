#!/usr/bin/env python3
"""Cloudphone agent.

Berjalan di laptop atau server Ubuntu. Agent hanya melakukan koneksi keluar (HTTPS)
ke dashboard: melaporkan status container Redroid, lalu mengerjakan perintah yang
diantrekan dari dashboard (buat, nyalakan, matikan, mulai ulang, hapus HP).
Tidak ada port yang dibuka ke internet. Hanya memakai pustaka standar Python 3.8+.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

VERSION = "1.0.0"
CONFIG_PATH = "/etc/cloudphone/agent.json"
DATA_ROOT = "/var/lib/cloudphone"

# Daftar putih image. Server tidak bisa menyuruh agent menjalankan image lain.
IMAGES = {
    "11": "redroid/redroid:11.0.0-latest",
    "12": "redroid/redroid:12.0.0-latest",
    "13": "redroid/redroid:13.0.0-latest",
    "14": "redroid/redroid:14.0.0-latest",
}
ID_RE = re.compile(r"^ph_[0-9a-f]{8}$")


def log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


class CmdError(Exception):
    pass


def run(cmd, timeout=60):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        raise CmdError("Perintah tidak ditemukan: %s" % cmd[0])
    except subprocess.TimeoutExpired:
        raise CmdError("Waktu habis: %s" % " ".join(cmd[:3]))


def tail(text: str, n: int = 400) -> str:
    text = (text or "").strip()
    return text[-n:] if text else "tanpa pesan error"


# ---------------------------------------------------------------- docker / adb


def container_state(name):
    try:
        r = run(["docker", "inspect", "-f", "{{.State.Status}}", name], timeout=20)
    except CmdError:
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def adb_connect(port):
    if not shutil.which("adb"):
        return
    try:
        run(["adb", "connect", "127.0.0.1:%d" % port], timeout=15)
    except CmdError:
        pass


def adb_disconnect(port):
    if not shutil.which("adb"):
        return
    try:
        run(["adb", "disconnect", "127.0.0.1:%d" % port], timeout=15)
    except CmdError:
        pass


def list_phones():
    """Daftar container Cloudphone, atau None jika docker tidak bisa dihubungi."""
    fmt = '{{.Label "cloudphone.id"}}\t{{.Label "cloudphone.port"}}\t{{.State}}'
    try:
        r = run(["docker", "ps", "-a", "--filter", "label=cloudphone", "--format", fmt], timeout=20)
    except CmdError:
        return None
    if r.returncode != 0:
        return None
    out = []
    for line in r.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) != 3 or not ID_RE.match(parts[0]):
            continue
        state = parts[2].strip()
        status = "running" if state == "running" else "restarting" if state == "restarting" else "stopped"
        try:
            port = int(parts[1])
        except ValueError:
            port = 0
        out.append({"id": parts[0], "port": port, "status": status})
    return out


# ------------------------------------------------------------------ perintah


def phone_id(p):
    pid = str(p.get("id", ""))
    if not ID_RE.match(pid):
        raise CmdError("ID HP tidak valid")
    return pid


def int_in(p, key, lo, hi):
    try:
        v = int(p.get(key))
    except (TypeError, ValueError):
        raise CmdError("Nilai %s tidak valid" % key)
    if not lo <= v <= hi:
        raise CmdError("Nilai %s di luar batas" % key)
    return v


def cmd_create(p):
    pid = phone_id(p)
    image = IMAGES.get(str(p.get("android")))
    if not image:
        raise CmdError("Versi Android tidak didukung")
    width = int_in(p, "width", 360, 2160)
    height = int_in(p, "height", 640, 3840)
    dpi = int_in(p, "dpi", 120, 640)
    port = int_in(p, "port", 1024, 65535)
    name = "cp-" + pid
    data = os.path.join(DATA_ROOT, pid)

    existing = container_state(name)
    if existing == "running":
        adb_connect(port)
        return
    if existing is not None:
        run(["docker", "rm", "-f", name], timeout=60)

    os.makedirs(data, exist_ok=True)
    log("membuat %s (Android %s, %dx%d)" % (name, p.get("android"), width, height))
    r = run(
        [
            "docker", "run", "-itd", "--privileged",
            "--name", name,
            "--restart", "unless-stopped",
            "--label", "cloudphone=1",
            "--label", "cloudphone.id=" + pid,
            "--label", "cloudphone.port=%d" % port,
            "-v", "%s:/data" % data,
            "-p", "127.0.0.1:%d:5555" % port,
            image,
            "androidboot.redroid_width=%d" % width,
            "androidboot.redroid_height=%d" % height,
            "androidboot.redroid_dpi=%d" % dpi,
            "androidboot.redroid_gpu_mode=guest",
        ],
        timeout=1800,  # termasuk mengunduh image saat pertama kali
    )
    if r.returncode != 0:
        raise CmdError(tail(r.stderr or r.stdout))

    time.sleep(8)
    if container_state(name) != "running":
        logs = run(["docker", "logs", "--tail", "15", name], timeout=20)
        raise CmdError(
            "Container langsung berhenti, kemungkinan binder belum aktif di kernel. "
            + tail(logs.stdout + logs.stderr, 250)
        )
    adb_connect(port)


def cmd_start(p):
    pid = phone_id(p)
    port = int_in(p, "port", 1024, 65535)
    r = run(["docker", "start", "cp-" + pid], timeout=60)
    if r.returncode != 0:
        raise CmdError(tail(r.stderr))
    time.sleep(3)
    adb_connect(port)


def cmd_stop(p):
    pid = phone_id(p)
    port = int_in(p, "port", 1024, 65535)
    r = run(["docker", "stop", "-t", "10", "cp-" + pid], timeout=90)
    if r.returncode != 0:
        raise CmdError(tail(r.stderr))
    adb_disconnect(port)


def cmd_restart(p):
    pid = phone_id(p)
    port = int_in(p, "port", 1024, 65535)
    r = run(["docker", "restart", "-t", "10", "cp-" + pid], timeout=120)
    if r.returncode != 0:
        raise CmdError(tail(r.stderr))
    time.sleep(3)
    adb_connect(port)


def cmd_delete(p):
    pid = phone_id(p)
    port = int_in(p, "port", 1024, 65535)
    r = run(["docker", "rm", "-f", "cp-" + pid], timeout=90)
    if r.returncode != 0 and "No such container" not in (r.stderr or ""):
        raise CmdError(tail(r.stderr))
    adb_disconnect(port)
    shutil.rmtree(os.path.join(DATA_ROOT, pid), ignore_errors=True)


HANDLERS = {
    "create": cmd_create,
    "start": cmd_start,
    "stop": cmd_stop,
    "restart": cmd_restart,
    "delete": cmd_delete,
}


class Worker(threading.Thread):
    """Mengerjakan perintah satu per satu di thread terpisah supaya sinkronisasi
    ke dashboard tetap berjalan saat perintah lama (misalnya unduh image) dikerjakan."""

    def __init__(self):
        super().__init__(daemon=True)
        self.jobs = queue.Queue()
        self.lock = threading.Lock()
        self.results = []

    def run(self):
        while True:
            cmd = self.jobs.get()
            result = {"command_id": cmd.get("id"), "ok": True}
            try:
                handler = HANDLERS.get(cmd.get("action"))
                phone = cmd.get("phone")
                if handler is None or not isinstance(phone, dict):
                    raise CmdError("Perintah tidak dikenal")
                handler(phone)
                log("selesai: %s" % cmd.get("action"))
            except CmdError as e:
                log("gagal: %s: %s" % (cmd.get("action"), e))
                result = {"command_id": cmd.get("id"), "ok": False, "error": str(e)[-400:]}
            except Exception as e:  # noqa: BLE001
                log("error tak terduga: %r" % (e,))
                result = {"command_id": cmd.get("id"), "ok": False, "error": "Error agent: %s" % e}
            with self.lock:
                self.results.append(result)

    def take(self):
        with self.lock:
            out, self.results = self.results, []
        return out

    def restore(self, items):
        with self.lock:
            self.results = items + self.results


class AdbKeeper(threading.Thread):
    """Menyambungkan ulang adb ke HP yang menyala (misalnya setelah laptop reboot)."""

    def __init__(self):
        super().__init__(daemon=True)
        self.lock = threading.Lock()
        self.phones = []

    def update(self, phones):
        with self.lock:
            self.phones = list(phones or [])

    def run(self):
        while True:
            time.sleep(20)
            try:
                if not shutil.which("adb"):
                    continue
                with self.lock:
                    phones = list(self.phones)
                running = [p for p in phones if p["status"] == "running" and p["port"]]
                if not running:
                    continue
                r = run(["adb", "devices"], timeout=15)
                connected = set()
                for line in r.stdout.splitlines()[1:]:
                    parts = line.split("\t")
                    if len(parts) == 2 and parts[1].strip() == "device":
                        connected.add(parts[0])
                for p in running:
                    if "127.0.0.1:%d" % p["port"] not in connected:
                        adb_connect(p["port"])
            except Exception:  # noqa: BLE001
                pass


# --------------------------------------------------------------------- info

_slow = {"at": 0.0, "data": {}}


def os_name():
    try:
        with open("/etc/os-release") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return platform.system()


def binder_ok():
    if os.path.exists("/dev/binderfs") or os.path.exists("/dev/binder"):
        return True
    for path in ("/proc/filesystems", "/proc/modules"):
        try:
            with open(path) as f:
                if "binder" in f.read():
                    return True
        except OSError:
            pass
    return False


def slow_info():
    if time.time() - _slow["at"] < 60 and _slow["data"]:
        return _slow["data"]
    docker = False
    try:
        r = run(["docker", "version", "--format", "{{.Server.Version}}"], timeout=15)
        if r.returncode == 0 and r.stdout.strip():
            docker = r.stdout.strip()
    except CmdError:
        pass
    _slow["data"] = {
        "os": os_name(),
        "kernel": platform.release(),
        "docker": docker,
        "binder": binder_ok(),
        "adb": bool(shutil.which("adb")),
    }
    _slow["at"] = time.time()
    return _slow["data"]


def meminfo():
    values = {}
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                key, _, rest = line.partition(":")
                values[key] = int(rest.split()[0])
    except (OSError, ValueError, IndexError):
        return {}
    return {
        "mem_total_mb": values.get("MemTotal", 0) // 1024,
        "mem_available_mb": values.get("MemAvailable", 0) // 1024,
    }


def gather_info():
    info = {"agent": VERSION, "cpus": os.cpu_count() or 1}
    try:
        info["load1"] = round(os.getloadavg()[0], 2)
    except OSError:
        pass
    try:
        with open("/proc/uptime") as f:
            info["uptime_s"] = int(float(f.read().split()[0]))
    except (OSError, ValueError, IndexError):
        pass
    info.update(meminfo())
    info.update(slow_info())
    return info


# ------------------------------------------------------------------- jaringan


def load_config(path):
    cfg = {}
    try:
        with open(path) as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        pass
    cfg["server"] = os.environ.get("CLOUDPHONE_SERVER", cfg.get("server", "")).rstrip("/")
    cfg["token"] = os.environ.get("CLOUDPHONE_TOKEN", cfg.get("token", ""))
    if not cfg["server"] or not cfg["token"]:
        sys.exit("Konfigurasi tidak lengkap: butuh 'server' dan 'token' di %s" % path)
    return cfg


def post_sync(cfg, payload):
    req = urllib.request.Request(
        cfg["server"] + "/api/agent/sync",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "Authorization": "Bearer " + cfg["token"],
            "Content-Type": "application/json",
            "User-Agent": "cloudphone-agent/" + VERSION,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def main():
    ap = argparse.ArgumentParser(description="Agent Cloudphone")
    ap.add_argument("--config", default=CONFIG_PATH)
    ap.add_argument("--version", action="store_true")
    ap.add_argument("--max-loops", type=int, default=0, help=argparse.SUPPRESS)  # untuk pengujian
    args = ap.parse_args()
    if args.version:
        print(VERSION)
        return

    cfg = load_config(args.config)
    log("agent %s, server %s" % (VERSION, cfg["server"]))

    worker = Worker()
    worker.start()
    keeper = AdbKeeper()
    keeper.start()

    failures = 0
    loops = 0
    while True:
        loops += 1
        results = worker.take()
        phones = list_phones()
        keeper.update(phones)
        payload = {"hostname": socket.gethostname(), "info": gather_info(), "results": results}
        if phones is not None:
            payload["phones"] = [{"id": p["id"], "status": p["status"]} for p in phones]

        delay = 10.0
        try:
            resp = post_sync(cfg, payload)
            failures = 0
            for cmd in resp.get("commands", []):
                worker.jobs.put(cmd)
            delay = min(60.0, max(1.0, float(resp.get("poll_ms", 10000)) / 1000.0))
        except urllib.error.HTTPError as e:
            worker.restore(results)
            if e.code == 401:
                log("token ditolak dashboard; mesin mungkin sudah dihapus. Coba lagi 60 detik.")
                delay = 60.0
            else:
                failures += 1
                delay = min(60.0, 5.0 * failures)
                log("dashboard membalas HTTP %d" % e.code)
        except Exception as e:  # noqa: BLE001
            worker.restore(results)
            failures += 1
            delay = min(60.0, 5.0 * failures)
            log("gagal menghubungi dashboard: %s" % e)

        if args.max_loops and loops >= args.max_loops:
            time.sleep(1.5)  # beri waktu worker menyelesaikan perintah uji
            break
        time.sleep(delay)


if __name__ == "__main__":
    main()
