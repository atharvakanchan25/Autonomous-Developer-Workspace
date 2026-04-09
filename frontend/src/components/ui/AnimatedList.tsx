"use client";

import { useMemo, type ReactElement, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function AnimatedList({
  children,
  className = "",
  delay = 1000,
}: AnimatedListProps) {
  const items = useMemo(() => {
    const childrenArray = Array.isArray(children) ? children : [children];
    return childrenArray.map((child, index) => {
      // Return a motion.div wrapper with dynamic spring animations
      const key = (child as ReactElement).key || index;
      return (
        <motion.div
          key={key}
          layout
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20, transition: { duration: 0.2 } }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25,
            mass: 0.8,
          }}
          className="w-full"
        >
          {child}
        </motion.div>
      );
    });
  }, [children]);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <AnimatePresence initial={false}>
        {items}
      </AnimatePresence>
    </div>
  );
}
