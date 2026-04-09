"use client";

import { useRef, useEffect, type ReactNode } from "react";

interface GlowingEffectProps {
  children: ReactNode;
  className?: string;
  color?: string;
  blur?: number;
  spread?: number;
  active?: boolean;
}

export function GlowingEffect({
  children,
  className = "",
  color = "rgba(52, 211, 153, 0.55)",
  blur = 8,
  spread = 1,
  active = true,
}: GlowingEffectProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    let frame: number;
    let angle = 0;

    function tick() {
      angle = (angle + 1) % 360;
      if (ref.current) {
        ref.current.style.setProperty("--glow-angle", `${angle}deg`);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  if (!active) return <>{children}</>;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Animated rotating glow border */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: `conic-gradient(from var(--glow-angle, 0deg), transparent 70%, ${color} 85%, transparent 100%)`,
          opacity: 0.7,
          padding: `${spread}px`,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor" as any,
          filter: `blur(${blur / 2}px)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          boxShadow: `0 0 ${blur}px ${spread}px ${color}`,
          opacity: 0.35,
        }}
      />
      {children}
    </div>
  );
}
