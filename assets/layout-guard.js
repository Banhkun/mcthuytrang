/**
 * LAYOUT GUARD v2 — Hệ thống bảo vệ bố cục 2 chiều (Two-Way Collision Engine)
 * Chống tuyệt đối chữ, thẻ kính (.glass-box) và khung ảnh (.photo-frame) đè lên người (cutout)
 * hoặc đè lên nhau trên mọi kích thước màn hình và khi xuất PDF.
 *
 * Cơ chế 3 tầng:
 *  1. Vertical Flow Guard: Kiểm tra tiêu đề / đoạn dẫn phía trên các .photo-frame và .glass-box.
 *     Nếu chạm hoặc quá sát (< 3mm), tự động đẩy khung xuống và cân chỉnh chiều cao để không tràn đáy trang.
 *  2. Silhouette Cutout Guard (120 dải ngang): Đo biên dạng alpha thực tế của từng ảnh cutout PNG
 *     từ assets/cutout-silhouettes.js. Nếu bất kỳ dòng chữ, thẻ .glass-box hay .photo-frame nào
 *     vi phạm khoảng thở an toàn (3mm) quanh dáng người:
 *     - Tầng 2A: Dịch nhẹ cutout về phía mép neo và/hoặc thu phóng mượt trong ngưỡng cho phép.
 *     - Tầng 2B (Two-Way Retraction): Nếu vẫn còn điểm chạm, tự động thu hẹp chiều rộng (max-width/width)
 *       hoặc dịch khối chữ / khung ảnh sang phía đối diện cho đến khi khoảng cách tách biệt hoàn toàn (overlap = 0).
 *  3. Soft Backdrop Fallback: Trong trường hợp bất khả kháng, giữ vị trí tốt nhất đã tìm được
 *     (tuyệt đối KHÔNG reset về vị trí đè chữ) và bọc thêm lớp kính mờ bảo vệ độ tương phản.
 *
 *  Mở index.html?guard=debug để xem trực quan đường bao dáng người (hồng) và vật cản (xanh).
 */
(function () {
  'use strict';

  const SIL = window.CUTOUT_SILHOUETTES || {};
  const DEBUG = /[?&]guard=debug/.test(location.search);
  const PAD_MM = 3.0;          // khoảng thở an toàn tối thiểu giữa chữ/khung và dáng người (mm)
  const FRAME_PAD_MM = 2.0;    // khoảng thở giữa khung ảnh và dáng người (mm)
  const MAX_SHIFT_MM = 24;
  const SHIFT_STEP_MM = 2;
  const MIN_SCALE = 0.78;
  const SCALE_STEP = 0.02;
  const SKIP_TEXT = '.photo-frame, .page-indicator-pill, .page-tagline, .client-card, .qr-frame, .guard-debug, script, style';
  const CUTOUT_SEL = 'img.img-cutout, img[data-cutout]';

  const report = [];

  function topBlock(el, page) {
    let node = el;
    while (node && node.parentElement && node.parentElement !== page) {
      node = node.parentElement;
    }
    return node || el;
  }

  function parsePos(value) {
    const parts = (value || '50% 100%').split(/\s+/);
    const toFrac = (v, fallback) => {
      if (!v) return fallback;
      if (v.endsWith('%')) return parseFloat(v) / 100;
      if (v === 'left' || v === 'top') return 0;
      if (v === 'right' || v === 'bottom') return 1;
      if (v === 'center') return 0.5;
      return fallback;
    };
    return [toFrac(parts[0], 0.5), toFrac(parts[1], 1)];
  }

  function isMirrored(img) {
    const t = getComputedStyle(img).transform;
    if (!t || t === 'none') return false;
    try { return new DOMMatrixReadOnly(t).a < 0; } catch (e) { return false; }
  }

  /** Dáng người thực tế của cutout dưới dạng 120 dải chữ nhật (toạ độ viewport). */
  function cutoutBands(img) {
    const r = img.getBoundingClientRect();
    const s = SIL[img.getAttribute('src')];
    const nw = s ? s.w : (img.naturalWidth || r.width);
    const nh = s ? s.h : (img.naturalHeight || r.height);
    if (!nw || !nh) return [];
    const scale = Math.min(r.width / nw, r.height / nh);
    const cw = nw * scale, ch = nh * scale;
    const [ox, oy] = parsePos(getComputedStyle(img).objectPosition);
    const x0 = r.left + (r.width - cw) * ox;
    const y0 = r.top + (r.height - ch) * oy;
    const mirror = isMirrored(img);
    if (!s || !s.rows) {
      return [{ left: x0 + cw * 0.1, right: x0 + cw * 0.9, top: y0, bottom: y0 + ch }];
    }
    const n = s.rows.length;
    const bands = [];
    s.rows.forEach((row, i) => {
      if (!row) return;
      let l = row[0], rr = row[1];
      if (mirror) { const t = 1 - rr; rr = 1 - l; l = t; }
      bands.push({
        left: x0 + cw * l,
        right: x0 + cw * rr,
        top: y0 + ch * i / n,
        bottom: y0 + ch * (i + 1) / n
      });
    });
    return bands;
  }

  /** Thu thập toàn bộ dòng chữ, thẻ .glass-box và khung .photo-frame làm vật cản. */
  function collectObstacles(page) {
    const rects = [];
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const el = node.parentElement;
        if (!el || el.closest(SKIP_TEXT) || el.closest('[data-guard-ignore]')) return NodeFilter.FILTER_REJECT;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const range = document.createRange();
    let node;
    while ((node = walker.nextNode())) {
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        rects.push({
          left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          el: node.parentElement,
          block: topBlock(node.parentElement, page),
          kind: 'text'
        });
      }
    }
    page.querySelectorAll('.glass-box:not([data-guard-ignore])').forEach(box => {
      const r = box.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        rects.push({
          left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          el: box,
          block: topBlock(box, page),
          kind: 'card'
        });
      }
    });
    page.querySelectorAll('.photo-frame:not([data-guard-ignore])').forEach(frame => {
      const r = frame.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        rects.push({
          left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          el: frame,
          block: topBlock(frame, page),
          kind: 'frame'
        });
      }
    });
    return rects;
  }

  function overlapArea(a, b, pad) {
    const w = Math.min(a.right + pad, b.right) - Math.max(a.left - pad, b.left);
    const h = Math.min(a.bottom + pad, b.bottom) - Math.max(a.top - pad, b.top);
    return (w > 0 && h > 0) ? w * h : 0;
  }

  function collisions(img, obstacles, padPx, framePadPx) {
    const bands = cutoutBands(img);
    let area = 0;
    const hitBlocks = new Set();
    for (const o of obstacles) {
      if (o.block === img || o.block.contains(img)) continue;
      const p = o.kind === 'frame' ? framePadPx : padPx;
      for (const b of bands) {
        const a = overlapArea(o, b, p);
        if (a > 0) {
          area += a;
          hitBlocks.add(o.block);
        }
      }
    }
    return { area, hitBlocks, bands };
  }

  function insidePage(bands, pr, pad) {
    let minL = Infinity, maxR = -Infinity;
    bands.forEach(b => {
      minL = Math.min(minL, b.left);
      maxR = Math.max(maxR, b.right);
    });
    return minL >= pr.left + pad && maxR <= pr.right - pad;
  }

  function resetPageState(page) {
    page.querySelectorAll(CUTOUT_SEL).forEach(img => {
      if (img.dataset.guardOrigHeight === undefined) {
        img.dataset.guardOrigHeight = img.style.height || '';
      }
      img.style.height = img.dataset.guardOrigHeight;
      img.style.translate = '';
    });
    page.querySelectorAll('[data-guard-orig-top]').forEach(el => {
      el.style.top = el.dataset.guardOrigTop;
    });
    page.querySelectorAll('[data-guard-orig-width]').forEach(el => {
      el.style.width = el.dataset.guardOrigWidth;
    });
    page.querySelectorAll('[data-guard-orig-translate]').forEach(el => {
      el.style.translate = el.dataset.guardOrigTranslate;
    });
  }

  function applyCandidate(img, dxMm, scale) {
    const orig = img.dataset.guardOrigHeight;
    const m = /^([\d.]+)(%|mm|px)$/.exec(orig || '');
    if (m && scale !== 1) {
      img.style.height = (parseFloat(m[1]) * scale).toFixed(2) + m[2];
    } else {
      img.style.height = orig;
    }
    img.style.translate = dxMm ? `${dxMm}mm 0` : '';
  }

  /**
   * Tầng 2B: Nếu sau khi điều chỉnh cutout mà một khối chữ/thẻ/khung vẫn còn chạm dáng người,
   * tự động thu hẹp hoặc dịch nhẹ khối đó ra xa cutout để đảm bảo không bao giờ đè lên nhau.
   */
  function retractBlocksFromCutout(img, page, hitBlocks, padPx, framePadPx, k) {
    const pr = page.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const cutoutOnRight = ((ir.left + ir.right) / 2 - pr.left) >= pr.width / 2;
    let retracted = false;

    hitBlocks.forEach(block => {
      if (!block || block === img || block.matches(CUTOUT_SEL)) return;
      const bands = cutoutBands(img);
      const br = block.getBoundingClientRect();
      const isFrame = block.classList.contains('photo-frame') || block.querySelector('.photo-frame');
      const p = isFrame ? framePadPx : padPx;

      // Tìm dải dáng người có giao cắt theo chiều dọc với block
      let overlapHoriz = 0;
      for (const b of bands) {
        if (b.bottom < br.top - p || b.top > br.bottom + p) continue;
        if (cutoutOnRight && br.right + p > b.left) {
          overlapHoriz = Math.max(overlapHoriz, (br.right + p) - b.left);
        } else if (!cutoutOnRight && b.right + p > br.left) {
          overlapHoriz = Math.max(overlapHoriz, (b.right + p) - br.left);
        }
      }

      if (overlapHoriz > 0.5) {
        const shrinkMm = Math.ceil((overlapHoriz / k) + 1.5);
        const curWidthPx = br.width;
        const curWidthMm = curWidthPx / k;
        if (curWidthMm - shrinkMm >= 48) {
          if (block.dataset.guardOrigWidth === undefined) {
            block.dataset.guardOrigWidth = block.style.width || '';
          }
          block.style.width = `${Math.max(48, +(curWidthMm - shrinkMm).toFixed(1))}mm`;
          if (!cutoutOnRight && block.style.left) {
            if (block.dataset.guardOrigTranslate === undefined) {
              block.dataset.guardOrigTranslate = block.style.translate || '';
            }
            block.style.translate = `${shrinkMm}mm 0`;
          }
          retracted = true;
        }
      }
    });

    return retracted;
  }

  function guardCutout(img, page, k) {
    const padPx = PAD_MM * k;
    const framePadPx = FRAME_PAD_MM * k;
    let obstacles = collectObstacles(page);
    const first = collisions(img, obstacles, padPx, framePadPx);
    if (!first.area) return { status: 'ok', dx: 0, scale: 1 };

    const pr = page.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const centre = (ir.left + ir.right) / 2 - pr.left;
    const dir = Math.abs(centre - pr.width / 2) < pr.width * 0.06 ? 0 : (centre > pr.width / 2 ? 1 : -1);

    let best = { area: first.area, dx: 0, scale: 1, hits: first.hitBlocks };

    for (let scale = 1; scale >= MIN_SCALE - 1e-6; scale -= SCALE_STEP) {
      for (let shift = 0; shift <= (dir ? MAX_SHIFT_MM : 0); shift += SHIFT_STEP_MM) {
        const dx = shift * dir;
        applyCandidate(img, dx, scale);
        const c = collisions(img, obstacles, padPx, framePadPx);
        if (shift && !insidePage(c.bands, pr, 1.5 * k)) break;
        if (c.area < best.area) {
          best = { area: c.area, dx, scale: +scale.toFixed(2), hits: c.hitBlocks };
        }
        if (!c.area) {
          return { status: 'adjusted', dx, scale: +scale.toFixed(2) };
        }
      }
    }

    // Áp dụng vị trí cutout tốt nhất tìm được (KHÔNG reset về 0,1)
    applyCandidate(img, best.dx, best.scale);

    // Tầng 2B: Thu hẹp hoặc dịch khối chữ/khung ảnh còn va chạm
    if (best.area > 0 && best.hits && best.hits.size > 0) {
      const didRetract = retractBlocksFromCutout(img, page, best.hits, padPx, framePadPx, k);
      if (didRetract) {
        obstacles = collectObstacles(page);
        const afterRetract = collisions(img, obstacles, padPx, framePadPx);
        if (!afterRetract.area) {
          return { status: 'adjusted+retracted', dx: best.dx, scale: best.scale };
        }
        best.area = afterRetract.area;
        best.hits = afterRetract.hitBlocks;
      }
    }

    if (best.area > 0 && best.hits) {
      best.hits.forEach(block => {
        if (!block.classList.contains('photo-frame')) {
          block.classList.add('guard-soft-backdrop');
        }
      });
      console.warn('[LayoutGuard] Đã tối ưu vị trí + bọc nền kính mờ bảo vệ chữ trên', page.id, img.getAttribute('src'));
      return { status: 'backdrop', dx: best.dx, scale: best.scale };
    }

    return { status: 'adjusted', dx: best.dx, scale: best.scale };
  }

  /** Tầng 1: Chữ tiêu đề đè lên đỉnh khung ảnh (.photo-frame) hoặc .glass-box -> đẩy xuống. */
  function guardFrames(page, k) {
    let moved = 0;
    const texts = collectObstacles(page).filter(t => t.kind === 'text');
    const containers = new Set();
    page.querySelectorAll('.photo-frame, .glass-box').forEach(f => containers.add(topBlock(f, page)));
    containers.forEach(container => {
      if (!container.style.top) return;
      const targets = [container, ...Array.from(container.querySelectorAll('.photo-frame, .glass-box'))];
      let need = 0;
      for (const t of texts) {
        if (t.block === container || container.contains(t.el)) continue;
        for (const f of targets) {
          const r = f.getBoundingClientRect();
          if (overlapArea(t, r, 1.5 * k) > 0 && t.top < r.top + 14 * k) {
            need = Math.max(need, t.bottom + 3.5 * k - r.top);
          }
        }
      }
      if (need > 0) {
        if (container.dataset.guardOrigTop === undefined) {
          container.dataset.guardOrigTop = container.style.top;
        }
        container.style.top = `calc(${container.dataset.guardOrigTop} + ${(need / k).toFixed(1)}mm)`;
        moved++;
      }
    });
    return moved;
  }

  function drawDebug(page, obstacles) {
    page.querySelectorAll('.guard-debug').forEach(n => n.remove());
    if (!DEBUG) return;
    const pr = page.getBoundingClientRect();
    const add = (r, color) => {
      const d = document.createElement('div');
      d.className = 'guard-debug';
      Object.assign(d.style, {
        position: 'absolute',
        left: (r.left - pr.left) + 'px',
        top: (r.top - pr.top) + 'px',
        width: (r.right - r.left) + 'px',
        height: (r.bottom - r.top) + 'px',
        outline: `1px solid ${color}`,
        zIndex: 999,
        pointerEvents: 'none'
      });
      page.appendChild(d);
    };
    obstacles.forEach(o => add(o, o.kind === 'frame' ? 'rgba(16,185,129,.65)' : 'rgba(0,120,255,.55)'));
    page.querySelectorAll(CUTOUT_SEL).forEach(img => cutoutBands(img).forEach(b => add(b, 'rgba(255,0,80,.5)')));
  }

  function run() {
    report.length = 0;
    document.querySelectorAll('.guard-soft-backdrop').forEach(n => n.classList.remove('guard-soft-backdrop'));
    document.querySelectorAll('.page').forEach(page => {
      const savedZoom = page.style.zoom;
      page.style.zoom = '';
      resetPageState(page);
      const k = page.getBoundingClientRect().width / 297; // px per mm

      const framesMoved = guardFrames(page, k);
      page.querySelectorAll(CUTOUT_SEL).forEach(img => {
        const res = guardCutout(img, page, k);
        report.push({ page: page.id, cutout: img.getAttribute('src'), framesMoved, ...res });
      });
      if (framesMoved && !page.querySelector(CUTOUT_SEL)) {
        report.push({ page: page.id, cutout: '-', framesMoved, status: 'frames' });
      }
      drawDebug(page, collectObstacles(page));
      page.style.zoom = savedZoom;
    });
    const changed = report.filter(r => r.status !== 'ok' || r.framesMoved);
    if (changed.length) console.table(changed);
    document.documentElement.dataset.layoutGuardReport = JSON.stringify(changed);
    document.documentElement.dataset.layoutGuard = changed.some(r => r.status === 'backdrop') ? 'warn' : 'ok';
    return report.slice();
  }

  function whenReady() {
    const imgs = Array.from(document.querySelectorAll('.page img'));
    const loads = imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    }));
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    return Promise.all([fonts, ...loads]);
  }

  window.LayoutGuard = { run, report };
  const timeout = new Promise(res => setTimeout(res, 3000));
  Promise.race([whenReady(), timeout]).then(() => requestAnimationFrame(run));
  window.addEventListener('load', () => setTimeout(run, 60));
  window.addEventListener('beforeprint', run);

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(run, 150);
  });
})();
