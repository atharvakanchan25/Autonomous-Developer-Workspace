"use client";

import { motion } from "framer-motion";
import { useAnimatedNumber } from "@/lib/useAnimatedNumber";
import { duration, ease, cardHover } from "@/lib/motion";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "gray" | "green" | "indigo" | "red" | "amber";
}

const ACCENTS = {
  gray:   "border-l-gray-600",
  green:  "border-l-green-500",
  indigo: "border-l-indigo-500",
  red:    "border-l-red-500",
  amber:  "border-l-amber-400",
};

function AnimatedValue({ value }: { value: string | number }) {
  const isNumber = typeof value === "number";
  const animated = useAnimatedNumber(isNumber ? value : 0, 400);

  if (!isNumber) {
    return (
      <motion.span
        key={String(value)}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.standard, ease: ease.enter }}
      >
        {value}
      </motion.span>
    );
  }

  return <span>{animated}</span>;
}

export function StatCard({ label, value, sub, accent = "gray" }: StatCardProps) {
  return (
    <motion.div
      className={`rounded-xl border border-gray-700 bg-[#1a1f2e] p-5 shadow-sm border-l-4 ${ACCENTS[accent]}`}
      whileHover={cardHover}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.standard, ease: ease.enter }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-gray-100">
        <AnimatedValue value={value} />
      </p>
      {sub && (
        <motion.p
          className="mt-0.5 text-xs text-gray-400"
          key={sub}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.standard, delay: 0.05 }}
        >
          {sub}
        </motion.p>
      )}
    </motion.div>
  );
}
