import json
import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

CATALOG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "all_drive_portraits_catalog.json"))
OUTPUT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "curated_potential_portraits.json"))

# Folders known to contain solo MC portraits, studio shots, gala stages, and launching events
PRIORITY_KEYWORDS = [
    "locknlock",
    "l'oréal",
    "l'oreal",
    "zens",
    "3v group",
    "htv9",
    "danone",
    "huawei",
    "honor",
    "dazi",
    "kira",
    "thỏ ơi",
    "keyshe",
    "hacom",
    "hồng bàng"
]

# Folders known to be crowded or non-MC focused
EXCLUDE_KEYWORDS = [
    "activation",
    "budweiser",
    "halloween",
    "thiếu nhi",
    "đồ rê mí",
    "citigym",
    "dove",
    "downy",
    "tiktok"
]

def is_potential_candidate(item):
    folder_lower = item["folder"].lower()
    file_lower = item["filename"].lower()
    size_kb = item.get("size_kb") or 0

    # 1. Exclude crowd/activation folders
    for kw in EXCLUDE_KEYWORDS:
        if kw in folder_lower:
            return False, f"Excluded keyword: {kw}"

    # 2. File size threshold (must be high resolution, >= 600 KB, ideally > 1MB)
    if size_kb < 500:
        return False, f"Too small: {size_kb} KB"

    # 3. Check priority folder relevance
    is_priority = any(kw in folder_lower for kw in PRIORITY_KEYWORDS)
    
    # 4. Skip generic gallery overviews or thumbnails
    if "gallery" in file_lower or "banner" in file_lower or "poster" in file_lower:
        return False, "Gallery overview / banner"

    return True, "Passed"

def main():
    if not os.path.exists(CATALOG_PATH):
        print(f"Error: Catalog not found at {CATALOG_PATH}")
        return

    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)["catalog"]

    curated = []
    by_folder = {}

    for item in catalog:
        passed, reason = is_potential_candidate(item)
        if passed:
            curated.append(item)
            folder = item["folder"]
            by_folder[folder] = by_folder.get(folder, 0) + 1

    # Sort by file size descending (highest resolution raw camera captures first)
    curated.sort(key=lambda x: x.get("size_kb") or 0, reverse=True)

    print(f"🎯 Filtered {len(catalog)} raw photos down to {len(curated)} high-potential solo portrait candidates!\n")
    print("=== BREAKDOWN OF POTENTIAL PORTRAITS BY FOLDER ===")
    for folder, count in sorted(by_folder.items(), key=lambda x: x[1], reverse=True):
        print(f"  {count:2d} photos | {folder}")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "total_potential_candidates": len(curated),
            "folder_counts": by_folder,
            "candidates": curated
        }, f, ensure_ascii=False, indent=2)

    print(f"\n💾 Saved curated potential portraits to: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
