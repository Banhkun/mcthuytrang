import urllib.request
import urllib.parse
import json
import time
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
    print('   Set it in PowerShell via:  $env:COLAB_URL = "https://<tunnel>.trycloudflare.com"')
    sys.exit(1)
COLAB_URL = COLAB_URL.rstrip("/")

# The complete 3-stage Curation & Matting script that executes on Colab GPU
REMOTE_CURATION_CODE = """
import os, cv2, json, time, hashlib
import numpy as np
from PIL import Image
from rembg import remove, new_session
from pymatting.foreground.estimate_foreground_ml import estimate_foreground_ml

BASE_DIR = "/content/drive/MyDrive/MC Thùy Trang - testing/Ảnh chưa edit"
OUTPUT_DIR = "/content/drive/MyDrive/MC Thùy Trang - testing/Cutouts_Curated_BiRefNet"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 1. Pre-load Face Detector for Solo Check
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# 2. Release any dangling PyTorch VRAM and reuse existing server session
import torch
if torch.cuda.is_available():
    torch.cuda.empty_cache()

# Find any already-loaded session in globals (avoids duplicate CUDA context allocation)
session = None
for k in ["session", "model", "matting_session", "birefnet_session", "portrait_session"]:
    if k in globals() and globals()[k] is not None:
        session = globals()[k]
        break

if session is None:
    try:
        session = new_session("birefnet-portrait", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    except Exception as e:
        print(f"CUDA session creation failed ({e}), falling back to CPU session...", flush=True)
        session = new_session("birefnet-portrait", providers=["CPUExecutionProvider"])

MAX_SIDE = 1800  # Memory-safe resolution limit for Colab T4 GPU

EXCLUDE_KEYWORDS = ["activation", "budweiser", "halloween", "thiếu nhi", "citigym", "dove", "downy", "tiktok"]

def evaluate_solo_framing(img_cv):
    h, w, _ = img_cv.shape
    s = min(1.0, 1200 / w)  # Haar on a 24 MP frame takes seconds: detect on a ~1200 px copy
    small = cv2.resize(img_cv, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else img_cv
    ms = max(20, int(60 * s))
    faces = [tuple(int(v / s) for v in f) for f in face_cascade.detectMultiScale(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), scaleFactor=1.15, minNeighbors=5, minSize=(ms, ms))]
    
    if len(faces) <= 1:
        return True, (0, 0, w, h)
    
    # Check if 1 dominant face accounts for > 70% total area
    areas = [fw * fh for (fx, fy, fw, fh) in faces]
    max_area = max(areas)
    if (max_area / sum(areas)) > 0.70:
        dom_idx = areas.index(max_area)
        fx, fy, fw, fh = faces[dom_idx]
        margin_x = int(fw * 1.8)
        return True, (max(0, fx - margin_x), 0, min(w, fx + fw + margin_x), h)
    
    return False, None

def calculate_mqs(alpha):
    total_fg = np.count_nonzero(alpha >= 15)
    if total_fg < (alpha.size * 0.03):
        return 0.0
    fringe = np.count_nonzero((alpha > 15) & (alpha < 240))
    fringe_score = max(0.0, 1.0 - (fringe / max(total_fg, 1) * 2.5))
    
    _, _, stats, _ = cv2.connectedComponentsWithStats((alpha >= 15).astype(np.uint8))
    max_area = np.max(stats[1:, cv2.CC_STAT_AREA]) if len(stats) > 1 else 0
    stray_score = max(0.0, 1.0 - ((total_fg - max_area) / max(total_fg, 1) * 4.0))
    
    coverage = total_fg / alpha.size
    cov_score = 1.0 if 0.08 <= coverage <= 0.85 else 0.5
    return (fringe_score * 40.0) + (stray_score * 40.0) + (cov_score * 20.0)

def decontaminate(img_rgb, alpha):
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel)
    alpha[alpha < 12] = 0
    alpha[alpha > 245] = 255
    
    fg_rgb = estimate_foreground_ml(img_rgb.astype(np.float64)/255.0, alpha.astype(np.float64)/255.0)
    fg_u8 = np.clip(fg_rgb * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack((fg_u8, alpha)), "RGBA")

# Run Curation Loop
folders = [f for f in sorted(os.listdir(BASE_DIR)) if os.path.isdir(os.path.join(BASE_DIR, f))]
print(f"Scanning {len(folders)} folders on Drive...", flush=True)

results = []
for folder in folders:
    if any(kw in folder.lower() for kw in EXCLUDE_KEYWORDS):
        continue
    fpath = os.path.join(BASE_DIR, folder)
    for fname in sorted(os.listdir(fpath)):
        if not fname.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue
        full_p = os.path.join(fpath, fname)
        if os.path.getsize(full_p) < 600 * 1024:
            continue
        out_name = f"{folder[:25]}__{fname[:-4]}__{hashlib.md5(full_p.encode()).hexdigest()[:6]}.png".replace(" ", "_")
        out_path = os.path.join(OUTPUT_DIR, out_name)
        if os.path.exists(out_path):
            continue  # resume: already curated in an earlier run
        img = cv2.imread(full_p)
        if img is None or img.shape[0] < img.shape[1]:
            continue
            
        is_solo, box = evaluate_solo_framing(img)
        if not is_solo:
            continue
            
        cropped = img[box[1]:box[3], box[0]:box[2]]
        long_side = max(cropped.shape[:2])
        if long_side > MAX_SIDE:
            cropped = cv2.resize(cropped, None, fx=MAX_SIDE / long_side, fy=MAX_SIDE / long_side, interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(cropped, cv2.COLOR_BGR2RGB)
        pil_im = Image.fromarray(rgb)
        
        try:
            raw_mask = np.array(remove(pil_im, session=session, only_mask=True))
        except Exception as e:
            print(f"ERROR matting {out_name}: {e}", flush=True)
            continue
        mqs = calculate_mqs(raw_mask)
        if mqs < 75.0:
            print(f"REJECT [MQS {mqs:.1f}]: {out_name}", flush=True)
            continue
            
        try:
            clean_rgba = decontaminate(rgb, raw_mask)
        except Exception as e:
            print(f"ERROR decontaminate {out_name}: {e}", flush=True)
            continue
        bbox = clean_rgba.getbbox()
        if bbox:
            clean_rgba = clean_rgba.crop(bbox)
            
        clean_rgba.save(out_path, format="PNG")
        results.append({"file": out_name, "mqs": round(mqs, 1), "size": f"{clean_rgba.width}x{clean_rgba.height}"})
        print(f"PASS [MQS {mqs:.1f}]: {out_name}", flush=True)

        # Reclaim VRAM after every image to prevent OOM
        del raw_mask, pil_im, rgb, clean_rgba
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

print("CURATION_COMPLETE:" + json.dumps(results))
"""

# Runs REMOTE_CURATION_CODE in a background thread on Colab. print() inside the job is
# redirected to a log file via a globals override, so /exec returns immediately.
LAUNCHER_TEMPLATE = r'''
import threading, traceback
LOG = "/content/curation.log"
_code = __CODE__
_g = dict(globals())
def _job():
    with open(LOG, "w", buffering=1, encoding="utf-8") as f:
        def _print(*a, **k):
            f.write(" ".join(str(x) for x in a) + "\n")
        _g["print"] = _print
        try:
            exec(_code, _g)
        except Exception:
            f.write("CURATION_FAILED\n" + traceback.format_exc() + "\n")
threading.Thread(target=_job, name="curation", daemon=True).start()
print("STARTED")
'''

def _exec(code, timeout=60):
    payload = json.dumps({"code": code}).encode("utf-8")
    req = urllib.request.Request(f"{COLAB_URL}/exec", data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def run_curation_job(poll_s=10, max_poll_failures=12):
    first = _exec(LAUNCHER_TEMPLATE.replace("__CODE__", repr(REMOTE_CURATION_CODE)))
    print("Launcher:", (first.get("stdout") or first.get("stderr") or "").strip())
    if not first.get("success"):
        return
    seen, fails, t0 = 0, 0, time.time()
    while True:
        time.sleep(poll_s)
        try:
            r = _exec("print(open('/content/curation.log', encoding='utf-8').read(), end='')")
            if not r.get("success"):
                raise RuntimeError((r.get("stderr") or "")[-200:])
            fails = 0
        except Exception as e:
            fails += 1
            print(f"(poll failed {fails}/{max_poll_failures}: {e})")
            if fails >= max_poll_failures:
                print("Giving up polling. The job may still be running on Colab (log: /content/curation.log).")
                return
            continue
        log = r["stdout"]
        if len(log) > seen:
            print(log[seen:], end="", flush=True)
            seen = len(log)
        if "CURATION_COMPLETE:" in log or "CURATION_FAILED" in log:
            print(f"\nFinished in {round(time.time() - t0, 1)}s")
            return

if __name__ == "__main__":
    run_curation_job()
