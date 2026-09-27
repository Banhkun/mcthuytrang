import urllib.request
import urllib.parse
import json
import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

def get_colab_url():
    url = os.environ.get("COLAB_URL", "").strip()
    if not url and sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as key:
                url, _ = winreg.QueryValueEx(key, "COLAB_URL")
        except Exception:
            pass
    if not url and len(sys.argv) > 1 and sys.argv[1].startswith("http"):
        url = sys.argv[1].strip()
    if not url:
        print("❌ Error: COLAB_URL is not set.")
        print('   Set it in PowerShell via:  $env:COLAB_URL = "https://<tunnel>.trycloudflare.com"')
        sys.exit(1)
    return url.rstrip("/")

COLAB_URL = get_colab_url()

def list_folder(subfolder=""):
    url = f"{COLAB_URL}/list"
    if subfolder:
        url += f"?folder={urllib.parse.quote(subfolder)}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def do_cutout(rel_path, local_save_path):
    url = f"{COLAB_URL}/cutout-drive"
    payload = json.dumps({"path": rel_path}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    os.makedirs(os.path.dirname(os.path.abspath(local_save_path)), exist_ok=True)
    with urllib.request.urlopen(req, timeout=90) as resp:
        content = resp.read()
        with open(local_save_path, "wb") as f:
            f.write(content)
    print(f"✅ Saved cutout: {local_save_path} ({round(len(content)/1024, 1)} KB)")
    return local_save_path

def do_montage(rel_paths, local_save_path, size=(2400, 1350)):
    url = f"{COLAB_URL}/montage-drive"
    payload = json.dumps({"paths": rel_paths, "size": list(size)}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    os.makedirs(os.path.dirname(os.path.abspath(local_save_path)), exist_ok=True)
    with urllib.request.urlopen(req, timeout=120) as resp:
        content = resp.read()
        with open(local_save_path, "wb") as f:
            f.write(content)
    print(f"✨ Saved montage: {local_save_path} ({round(len(content)/1024, 1)} KB)")
    return local_save_path

def exec_code(code_str, timeout=60):
    url = f"{COLAB_URL}/exec"
    payload = json.dumps({"code": code_str}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

if __name__ == "__main__":
    print(f"Connected to Colab at: {COLAB_URL}")
    root = list_folder()
    items = root.get("items", [])
    print(f"Total root folders: {len(items)}")
