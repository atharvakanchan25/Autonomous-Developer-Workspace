"use client";

import { motion } from "framer-motion";
import { useAnimatedNumber } from "@/lib/useAnimatedNumber";
import { duration, ease } from "@/lib/motion";

interface ProgressSegment {
  pct: number;
  color: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "gray" | "green" | "indigo" | "red" | "amber";
  progressSegments?: ProgressSegment[];
}

const RING: Record<string, string> = {
  gray:   "ring-gray-700/40",
  green:  "ring-green-700/25",
  indigo: "ring-indigo-700/25",
  red:    "ring-red-700/25",
  amber:  "ring-amber-700/25",
};

const VALUE_COLOR: Record<string, string> = {
  gray:   "text-gray-100",
  green:  "text-green-300",
  indigo: "text-indigo-300",
  red:    "text-red-300",
  amber:  "text-amber-300",
};

function AnimatedValue({ value, accent }: { value: string | number; accent: string }) {
  const isNumber = typeof value === "number";
  const animated = useAnimatedNumber(isNumber ? value : 0, 600);

  if (!isNumber) {
    return (
      <motion.span
        key={String(value)}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.standard, ease: ease.enter }}
        className={VALUE_COLOR[accent]}
      >
        {value}
      </motion.span>
    );
  }
  return <span className={VALUE_COLOR[accent]}>{animated}</span>;
}

export function StatCard({ label, value, sub, accent = "gray", progressSegments }: StatCardProps) {
  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl bg-[#0d1117] p-5 ring-1 ${RING[accent]} shadow-lg`}
      whileHover={{ y: -2, scale: 1.01 }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.standard, ease: ease.enter }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.025] to-transparent" />

      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">{label}</p>

      <p className="mt-3 text-3xl font-bold tracking-tight">
        <AnimatedValue value={value} accent={accent} />
      </p>

      {sub && (
        <motion.p
          className="mt-1 text-xs text-gray-500"
          key={sub}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.standard, delay: 0.08 }}
        >
          {sub}
        </motion.p>
      )}

      {progressSegments && progressSegments.length > 0 && (
        <div className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
          {progressSegments.map((seg, i) =>
            seg.pct > 0 ? (
              <motion.div
                key={i}
                className={`h-full ${seg.color}`}
                initial={{ width: 0 }}
                animate={{ width: `${seg.pct}%` }}
                transition={{ duration: 0.7, ease: ease.enter, delay: i * 0.05 }}
              />
            ) : null
          )}
        </div>
      )}
    </motion.div>
  );
}
