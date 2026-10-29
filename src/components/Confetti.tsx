import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/sound';

const COLORS = ['#E60012', '#FFC81E', '#3BA7F5', '#3CB44B', '#FFFFFF', '#FF7A00', '#D63CA8'];

/** Canvas confetti burst. Skipped entirely when the user prefers reduced motion. */
export function Confetti({ burst }: { burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || prefersReducedMotion()) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const W = () => canvas.width;
    const H = () => canvas.height;
    const parts = Array.from({ length: 220 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? 0 : W(),
        y: H() * (0.55 + Math.random() * 0.2),
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 12) * dpr,
        vy: -(14 + Math.random() * 14) * dpr,
        w: (6 + Math.random() * 8) * dpr,
        h: (10 + Math.random() * 10) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: COLORS[i % COLORS.length],
        shape: i % 5 === 0 ? 'star' : i % 3 === 0 ? 'circle' : 'rect',
      };
    });
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, W(), H());
      for (const p of parts) {
        p.vy += 0.35 * dpr;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#14213D';
        ctx.lineWidth = 1.5 * dpr;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (p.shape === 'star') {
          ctx.beginPath();
          for (let k = 0; k < 10; k++) {
            const r = k % 2 === 0 ? p.w : p.w / 2.2;
            const a = (k * Math.PI) / 5;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
        }
        ctx.restore();
      }
      if (frame < 360) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W(), H());
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [burst]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
