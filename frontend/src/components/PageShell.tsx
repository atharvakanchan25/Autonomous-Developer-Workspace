"use client";

import { motion } from "framer-motion";
import { pageEnter } from "@/lib/motion";

/**
 * Wraps every page's scrollable content area with a consistent
 * fade + subtle upward entry animation.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="scrollbar-thin flex h-full flex-col overflow-y-auto"
      variants={pageEnter}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}
