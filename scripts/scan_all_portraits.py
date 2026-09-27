import urllib.request
import urllib.parse
import json
import os
import sys

# Ensure UTF-8 output in Windows terminal
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

COLAB_URL = os.environ.get("COLAB_URL", "").strip()
if not COLAB_URL and len(sys.argv) > 1 and sys.argv[1].startswith("http"):
    COLAB_URL = sys.argv[1].strip()
if not COLAB_URL:
    print("❌ Error: COLAB_URL is not set.")
    print('   Set it in PowerShell via:  $env:COLAB_URL = "https://<tunnel>.trycloudflare.com"')
    sys.exit(1)
COLAB_URL = COLAB_URL.rstrip("/")

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Antigravity/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

def scan_all_folders():
    print(f"📡 Connecting to Colab: {COLAB_URL}/list")
    root_data = get_json(f"{COLAB_URL}/list")
    folders = [it["name"] for it in root_data.get("items", []) if it.get("is_dir")]
    print(f"📁 Found {len(folders)} photoshoot folders on Drive\n")

    catalog = []
    folder_stats = {}

    for i, folder in enumerate(folders, 1):
        encoded = urllib.parse.quote(folder)
        folder_url = f"{COLAB_URL}/list?folder={encoded}"
        try:
            res = get_json(folder_url)
            items = res.get("items", [])
            images = [it for it in items if not it.get("is_dir") and it.get("name", "").lower().endswith((".jpg", ".jpeg", ".png"))]
            
            # Identify likely portrait / high quality candidates by file size (> 500 KB)
            high_res = [img for img in images if (img.get("size_kb") or 0) >= 400]
            folder_stats[folder] = {
                "total_photos": len(images),
                "high_res_candidates": len(high_res)
            }

            for img in high_res:
                catalog.append({
                    "folder": folder,
                    "filename": img["name"],
                    "rel_path": f"{folder}/{img['name']}",
                    "size_kb": img.get("size_kb")
                })

            print(f"[{i:2d}/{len(folders)}] {folder[:42]:<42} -> {len(high_res):3d} candidates ({len(images):3d} total)")
        except Exception as e:
            print(f"[{i:2d}/{len(folders)}] Error scanning {folder}: {e}")

    print(f"\n✨ Total high-resolution portrait candidates found: {len(catalog)}")

    # Save local catalog
    save_path = os.path.join(os.path.dirname(__file__), "..", "all_drive_portraits_catalog.json")
    save_path = os.path.abspath(save_path)
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump({
            "total_candidates": len(catalog),
            "folder_stats": folder_stats,
            "catalog": catalog
        }, f, ensure_ascii=False, indent=2)

    print(f"💾 Full catalog saved to: {save_path}")

if __name__ == "__main__":
    scan_all_folders()
