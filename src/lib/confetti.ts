export const confettiColors = ['#e3000f', '#0f9d58', '#b26a00', '#ffffff', '#f5c518'];

export interface BurstOptions {
  origin?: { x: number; y: number };
  count?: number;
  colors?: string[];
  duration?: number;
  spread?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  shape: 'rect' | 'circle';
  rotation: number;
  rotationSpeed: number;
  drag: number;
  gravity: number;
}

/**
 * Fire a burst of confetti from a fixed full-screen canvas. Returns a cleanup
 * function that stops the animation and removes the canvas from the DOM.
 */
export function burstConfetti(options: BurstOptions = {}): () => void {
  const {
    origin = { x: 0.5, y: 0.1 },
    count = 140,
    colors = confettiColors,
    duration = 1400,
    spread = 1,
  } = options;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';

  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const context = ctx;
  context.scale(dpr, dpr);

  const originX = origin.x * width;
  const originY = origin.y * height;

  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (4 + Math.random() * 9) * spread;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      drag: 0.93,
      gravity: 0.16,
    });
  }

  document.body.appendChild(canvas);

  let rafId = 0;
  let done = false;
  const startedAt = performance.now();

  function cleanup(): void {
    if (done) return;
    done = true;
    cancelAnimationFrame(rafId);
    canvas.remove();
  }

  function tick(now: number): void {
    const elapsed = now - startedAt;
    const progress = Math.min(elapsed / duration, 1);

    context.clearRect(0, 0, width, height);

    let alive = false;
    for (const p of particles) {
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      if (p.y > height + 40 || p.x < -40 || p.x > width + 40) continue;

      alive = true;
      const fade = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;

      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.rotation);
      context.globalAlpha = Math.max(0, Math.min(1, fade));
      context.fillStyle = p.color;
      if (p.shape === 'rect') {
        context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        context.beginPath();
        context.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }

    if (alive && progress < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      cleanup();
    }
  }

  rafId = requestAnimationFrame(tick);
  return cleanup;
}
