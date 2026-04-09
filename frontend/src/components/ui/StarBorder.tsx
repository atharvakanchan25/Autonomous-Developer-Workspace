"use client";

import React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

interface StarBorderProps extends HTMLMotionProps<"button"> {
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
  color?: string;
  speed?: string;
}

export const StarBorder = React.forwardRef<HTMLButtonElement, StarBorderProps>(
  (
    {
      as: Component = "button",
      className = "",
      children,
      color = "var(--accent, #06b6d4)",
      speed = "4s",
      ...props
    },
    ref
  ) => {
    // We use a custom wrapper since Framer Motion's generic motion() can't easily merge with 'as' in TS cleanly without type assertions,
    // but a standard button is fine.
    return (
      <div className={`relative inline-block overflow-hidden rounded-[8px] p-[1px] ${className}`}>
        {/* The glowing border animation track */}
        <div
          className="absolute inset-0 z-0 bg-[conic-gradient(from_0deg,transparent_0_340deg,var(--glow-color)_360deg)]"
          style={{
            "--glow-color": color,
            animation: `star-border-spin ${speed} linear infinite`,
          } as React.CSSProperties}
        />
        {/* Core background content blocking the inner section */}
        <Component
          ref={ref as any}
          className="relative z-10 flex h-full w-full items-center justify-center rounded-[7px] bg-[var(--surface-strong)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--surface)] hover:text-white"
          {...props}
        >
          {children}
        </Component>

        <style>{`
          @keyframes star-border-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
);

StarBorder.displayName = "StarBorder";
