"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  show: boolean;
  onClose: () => void;
  message?: string;
}

export function AdminOnlyToast({ show, onClose, message }: Props) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex items-center gap-3 rounded-xl border border-red-800 bg-[#1a1f2e] px-5 py-3 shadow-2xl">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-900/60">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-red-400">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-red-300">Admin access required</p>
              <p className="text-xs text-gray-400">{message ?? "Only admins can perform this action."}</p>
            </div>
            <button onClick={onClose} className="ml-2 text-gray-600 hover:text-gray-400 transition-colors">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
