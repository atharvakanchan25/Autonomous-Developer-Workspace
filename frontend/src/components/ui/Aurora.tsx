"use client";

import { useEffect, useRef } from "react";

interface AuroraProps {
  colorStops?: string[];
  amplitude?: number;
  blend?: number;
  speed?: number;
  className?: string;
}

export function Aurora({
  colorStops = ["#10b981", "#6366f1", "#0ea5e9"],
  amplitude = 1.0,
  blend = 0.5,
  speed = 0.5,
  className = "",
}: AuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function hexToRgb(hex: string) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return { r, g, b };
    }

    function draw(time: number) {
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const t = time * speed * 0.001;

      colorStops.forEach((color, i) => {
        const rgb = hexToRgb(color);
        const phase = (i / colorStops.length) * Math.PI * 2;
        const x = w * (0.2 + 0.6 * ((Math.sin(t * 0.7 + phase) + 1) / 2));
        const y = h * (0.2 + 0.6 * ((Math.cos(t * 0.5 + phase * 1.3) + 1) / 2));
        const radius = Math.min(w, h) * (0.4 + amplitude * 0.2 * Math.sin(t + phase));

        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.18 * blend})`);
        grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);

        ctx.globalCompositeOperation = i === 0 ? "source-over" : "screen";
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });
    }

    function loop(ts: number) {
      timeRef.current = ts;
      draw(ts);
      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorStops.join(","), amplitude, blend, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}
