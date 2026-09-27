import urllib.request
import json
import base64
import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

COLAB_URL = os.environ.get("COLAB_URL", "").strip()
if not COLAB_URL and sys.platform == "win32":
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as key:
            COLAB_URL, _ = winreg.QueryValueEx(key, "COLAB_URL")
    except Exception:
        pass
if not COLAB_URL and len(sys.argv) > 1 and sys.argv[1].startswith("http"):
    COLAB_URL = sys.argv[1].strip()
if not COLAB_URL:
    print("❌ Error: COLAB_URL is not set.")
    sys.exit(1)

COLAB_URL = COLAB_URL.rstrip("/")
REMOTE_DIR = "/content/drive/MyDrive/MC Thùy Trang - testing/Cutouts_Curated_BiRefNet"
LOCAL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "cutouts")
os.makedirs(LOCAL_DIR, exist_ok=True)

# Curated selections mapped to friendly local filenames
TARGET_FILES = {
    # 1. Gala / Evening Gown (PAPA LEE'S - MQS 98.0)
    "mc_gala_papalee.png": "YEP_-_PAPA_LEE'S_(2025)__KJT03426__012855.png",
    # 2. Gala ZENS (2026)
    "mc_gala_zens.png": "YEP_-__ZENS_(2026)__MEITU_20260427_124918591__a3c37d.png",
    # 3. Beauty / Cover / Keynote (LocknLock - MQS 96.1)
    "mc_cover_locknlock.png": "Lauching_Event_-_LocknLoc__MEITU_20251011_235415970__74f15e.png",
    # 4. Beauty / Tech / Hacom (MQS 98.1)
    "mc_hacom_beauty.png": "Khai_trương_-_Hacom_-_C__MEITU_20251022_205532798__d04746.png",
    # 5. Oishi Launch (MQS 97.7)
    "mc_oishi_launch.png": "Lauching_Event_-_Oishi_-___beauty_1719647851005__da0e04.png",
    # 6. Bilingual Dazi Host (MQS 97.4)
    "mc_bilingual_dazi.png": "Song_ngữ_-_Dazi_Signatu__606828638_2333433907095561_3201353715909182611_n__89c96b.png",
    # 7. Danone Aptamil Event (MQS 97.8)
    "mc_danone_event.png": "Event_-_Danone_(Aptamil)___587608047_2301644530274499_3130269121088053705_n__ba0f81.png",
    # 8. Wakodo Conference Solo (MQS 97.9)
    "mc_wakodo_solo.png": "Hội_thảo_-_Wakodo_-_Ă__z6178630910553_aac410161bfa6ce599c53ffd361a5cfa__0bee5f.png",
    # 9. Lotte Cinema Red Carpet (MQS 97.3)
    "mc_lotte_cinema.png": "Ra_mắt_phim_-_Lotte_Mar__MEITU_20250730_102701891__1a2b0f.png",
    # 10. Grab Event (MQS 96.0)
    "mc_grab_active.png": "Lauching_Event_-_Grab_-_C__MEITU_20250322_232846157__04c151.png"
}

def exec_code(code_str, timeout=60):
    url = f"{COLAB_URL}/exec"
    payload = json.dumps({"code": code_str}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def fetch_file(remote_filename, local_filename):
    local_path = os.path.join(LOCAL_DIR, local_filename)
    remote_path = f"{REMOTE_DIR}/{remote_filename}"
    
    code = f"""
import base64, os
p = {repr(remote_path)}
if os.path.exists(p):
    with open(p, 'rb') as f:
        print(base64.b64encode(f.read()).decode('ascii'))
else:
    print('FILE_NOT_FOUND')
"""
    print(f"📥 Fetching: {remote_filename[:35]}... -> {local_filename}")
    res = exec_code(code, timeout=60)
    if not res.get("success"):
        print(f"   ❌ Colab exec error: {res.get('stderr')}")
        return False
    
    out = (res.get("stdout") or "").strip()
    if out == "FILE_NOT_FOUND" or not out:
        print(f"   ❌ File not found on Drive: {remote_path}")
        return False
    
    try:
        raw_bytes = base64.b64decode(out)
        with open(local_path, "wb") as f:
            f.write(raw_bytes)
        print(f"   ✅ Saved: {local_filename} ({round(len(raw_bytes)/1024, 1)} KB)")
        return True
    except Exception as e:
        print(f"   ❌ Base64 decode failed: {e}")
        return False

def main():
    print(f"🔗 Colab Server: {COLAB_URL}")
    print(f"📁 Local Destination: {LOCAL_DIR}\n")
    success_count = 0
    for local_name, remote_name in TARGET_FILES.items():
        if fetch_file(remote_name, local_name):
            success_count += 1
    print(f"\n🎉 Finished downloading {success_count}/{len(TARGET_FILES)} curated cutouts!")

if __name__ == "__main__":
    main()
