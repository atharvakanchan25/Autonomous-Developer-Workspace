"use client";

import { useRef, useEffect } from "react";
import { motion, useInView, useAnimation } from "framer-motion";

interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
  stepDelay?: number;
  animateBy?: "words" | "chars";
  direction?: "top" | "bottom";
  threshold?: number;
  once?: boolean;
}

export function BlurText({
  text,
  className = "",
  delay = 0,
  stepDelay = 80,
  animateBy = "words",
  direction = "bottom",
  threshold = 0.3,
  once = true,
}: BlurTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once, amount: threshold });
  const controls = useAnimation();

  const tokens = animateBy === "words" ? text.split(" ") : text.split("");

  useEffect(() => {
    if (isInView) {
      controls.start("visible");
    } else if (!once) {
      controls.start("hidden");
    }
  }, [isInView, controls, once]);

  const yFrom = direction === "bottom" ? 12 : -12;

  return (
    <span ref={ref} className={`inline ${className}`} aria-label={text}>
      {tokens.map((token, i) => (
        <motion.span
          key={i}
          className="inline-block"
          style={{ willChange: "transform, opacity, filter" }}
          initial="hidden"
          animate={controls}
          variants={{
            hidden: {
              opacity: 0,
              y: yFrom,
              filter: "blur(12px)",
            },
            visible: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: {
                duration: 0.6,
                ease: [0.25, 0.46, 0.45, 0.94],
                delay: delay / 1000 + (i * stepDelay) / 1000,
              },
            },
          }}
        >
          {token}
          {animateBy === "words" && i < tokens.length - 1 ? "\u00a0" : ""}
        </motion.span>
      ))}
    </span>
  );
}
