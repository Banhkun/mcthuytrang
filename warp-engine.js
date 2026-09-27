/**
 * Generative & Programmatic Art Engine: Liquid Warp, Flow Field & Aura
 * For MC Thùy Trang Digital Art Showcase
 */

class MCArtEngine {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.options = Object.assign({
      mode: 'liquid-gold', // 'liquid-gold', 'cyber-aurora', 'stardust-flow', 'audio-pulse'
      particleCount: 120,
      warpForce: 0.8,
      glowIntensity: 1.0,
      interactive: true,
      audioReact: true
    }, options);

    this.width = this.canvas.width = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : window.innerWidth;
    this.height = this.canvas.height = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : window.innerHeight;

    this.mouse = {
      x: this.width * 0.5,
      y: this.height * 0.5,
      targetX: this.width * 0.5,
      targetY: this.height * 0.5,
      vx: 0,
      vy: 0,
      isHovered: false,
      radius: 140
    };

    this.ripples = [];
    this.particles = [];
    this.time = 0;
    this.audioTime = 0;

    this.initParticles();
    this.bindEvents();
    this.animate = this.animate.bind(this);
    this.rafId = requestAnimationFrame(this.animate);
  }

  initParticles() {
    this.particles = [];
    const count = this.options.particleCount;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        size: Math.random() * 2.5 + 0.8,
        baseSize: Math.random() * 2.5 + 0.8,
        alpha: Math.random() * 0.7 + 0.3,
        hueOffset: Math.random() * 40 - 20,
        orbitRadius: Math.random() * 180 + 60,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1)
      });
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      if (!this.canvas || !this.canvas.parentElement) return;
      this.width = this.canvas.width = this.canvas.parentElement.clientWidth;
      this.height = this.canvas.height = this.canvas.parentElement.clientHeight;
    });

    const targetEl = this.canvas.parentElement || this.canvas;

    targetEl.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const newX = e.clientX - rect.left;
      const newY = e.clientY - rect.top;
      this.mouse.vx = (newX - this.mouse.targetX) * 0.3;
      this.mouse.vy = (newY - this.mouse.targetY) * 0.3;
      this.mouse.targetX = newX;
      this.mouse.targetY = newY;
      this.mouse.isHovered = true;

      // Spawn ripple on fast movement
      const speed = Math.hypot(this.mouse.vx, this.mouse.vy);
      if (speed > 5 && this.ripples.length < 12) {
        this.addRipple(newX, newY, Math.min(speed * 1.5, 45));
      }
    });

    targetEl.addEventListener('mouseleave', () => {
      this.mouse.isHovered = false;
    });

    targetEl.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.addRipple(e.clientX - rect.left, e.clientY - rect.top, 80);
    });

    // Touch support for mobile devices
    targetEl.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.targetX = e.touches[0].clientX - rect.left;
        this.mouse.targetY = e.touches[0].clientY - rect.top;
        this.mouse.isHovered = true;
        this.addRipple(this.mouse.targetX, this.mouse.targetY, 30);
      }
    }, { passive: true });
  }

  addRipple(x, y, maxStrength = 50) {
    this.ripples.push({
      x,
      y,
      radius: 5,
      maxRadius: Math.random() * 120 + 120,
      strength: maxStrength * this.options.warpForce,
      alpha: 1.0,
      color: this.getModeColor(this.time)
    });
  }

  setMode(mode) {
    this.options.mode = mode;
    this.initParticles();
  }

  getModeColor(t) {
    switch (this.options.mode) {
      case 'liquid-gold':
        return {
          h: 42 + Math.sin(t * 0.02) * 8,
          s: '85%',
          l: '60%',
          rgb: '245, 197, 85'
        };
      case 'cyber-aurora':
        return {
          h: 185 + Math.sin(t * 0.03) * 35,
          s: '95%',
          l: '65%',
          rgb: '60, 220, 240'
        };
      case 'stardust-flow':
        return {
          h: 330 + Math.sin(t * 0.02) * 30,
          s: '80%',
          l: '70%',
          rgb: '255, 150, 200'
        };
      case 'audio-pulse':
        return {
          h: 270 + Math.sin(t * 0.04) * 45,
          s: '90%',
          l: '65%',
          rgb: '180, 110, 255'
        };
      default:
        return { h: 42, s: '85%', l: '60%', rgb: '245, 197, 85' };
    }
  }

  animate() {
    this.time += 0.03;
    this.audioTime += 0.05;

    // Smooth mouse lerp
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.12;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.12;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const modeCol = this.getModeColor(this.time);

    // 1. Draw Flow Field & Liquid Wave Gradients
    this.drawGenerativeBackdrop(ctx, modeCol);

    // 2. Draw Interactive Ripples / Shockwaves
    this.drawRipples(ctx);

    // 3. Draw Orbiting & Swarming Particles
    this.drawParticles(ctx, modeCol);

    // 4. Draw Soundwave / Aura Ribbons around center / mouse
    this.drawAuraRibbons(ctx, modeCol);

    this.rafId = requestAnimationFrame(this.animate);
  }

  drawGenerativeBackdrop(ctx, col) {
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    // Ambient radial glow following mouse subtly
    const auraX = cx + (this.mouse.x - cx) * 0.35;
    const auraY = cy + (this.mouse.y - cy) * 0.35;

    const grad = ctx.createRadialGradient(
      auraX, auraY, 20,
      auraX, auraY, Math.max(this.width, this.height) * 0.65
    );
    grad.addColorStop(0, `hsla(${col.h}, ${col.s}, ${col.l}, ${0.18 * this.options.glowIntensity})`);
    grad.addColorStop(0.4, `hsla(${col.h + 20}, ${col.s}, 40%, ${0.08 * this.options.glowIntensity})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawRipples(ctx) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += 3.5;
      r.alpha *= 0.94;

      if (r.alpha <= 0.02 || r.radius >= r.maxRadius) {
        this.ripples.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r.color.rgb}, ${r.alpha * 0.6 * this.options.warpForce})`;
      ctx.lineWidth = Math.max(1, (1 - r.radius / r.maxRadius) * 4);
      ctx.shadowColor = `rgba(${r.color.rgb}, 0.8)`;
      ctx.shadowBlur = 15;
      ctx.stroke();

      // Secondary chromatic dispersion ring
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * 0.94, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(140, 90, 255, ${r.alpha * 0.35 * this.options.warpForce})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawParticles(ctx, col) {
    const mx = this.mouse.x;
    const my = this.mouse.y;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Swarm / Flow behavior
      p.orbitAngle += p.orbitSpeed;
      const targetOrbitX = mx + Math.cos(p.orbitAngle) * p.orbitRadius;
      const targetOrbitY = my + Math.sin(p.orbitAngle) * (p.orbitRadius * 0.7);

      // Interpolate towards orbit point if hovered, otherwise float ambiently
      if (this.mouse.isHovered) {
        p.vx += (targetOrbitX - p.x) * 0.015;
        p.vy += (targetOrbitY - p.y) * 0.015;
      } else {
        p.vx += Math.sin(this.time + i) * 0.06;
        p.vy += Math.cos(this.time * 0.8 + i) * 0.06;
      }

      p.vx *= 0.92;
      p.vy *= 0.92;
      p.x += p.vx;
      p.y += p.vy;

      // Wrap around bounds
      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;

      // Distance to cursor
      const dist = Math.hypot(p.x - mx, p.y - my);
      const isNear = dist < 120;
      const currentSize = isNear ? p.baseSize * 1.8 : p.baseSize;

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      const alpha = isNear ? Math.min(1.0, p.alpha * 1.6) : p.alpha;
      ctx.fillStyle = `hsla(${col.h + p.hueOffset}, ${col.s}, ${col.l}, ${alpha})`;
      ctx.shadowColor = `rgba(${col.rgb}, 0.9)`;
      ctx.shadowBlur = isNear ? 12 : 5;
      ctx.fill();
      ctx.restore();
    }
  }

  drawAuraRibbons(ctx, col) {
    // Elegant harmonic ribbons curving through the canvas
    const points = 5;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    ctx.save();
    ctx.lineWidth = 2.0;

    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      const phase = this.time * 0.6 + r * 1.8;
      const spread = 80 + r * 45;

      for (let i = 0; i <= points; i++) {
        const t = i / points;
        const x = this.width * t;
        const baseY = cy + Math.sin(t * Math.PI * 2 + phase) * spread;
        const mouseInfluence = Math.exp(-Math.pow((x - this.mouse.x) / 180, 2)) * (this.mouse.y - baseY) * 0.45;
        const y = baseY + mouseInfluence;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle = `hsla(${col.h + r * 15}, ${col.s}, ${col.l}, ${0.16 * this.options.glowIntensity})`;
      ctx.shadowColor = `rgba(${col.rgb}, 0.5)`;
      ctx.shadowBlur = 10;
      ctx.stroke();
    }
    ctx.restore();
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}

// Global hook for easy initialization
window.MCArtEngine = MCArtEngine;
