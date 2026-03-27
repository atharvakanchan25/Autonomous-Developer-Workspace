"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { duration, ease, buttonTap, fadeUp } from "@/lib/motion";

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function validate() {
    if (!email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setLoading(true);
    try {
      // TODO: wire up real password reset
      await new Promise((r) => setTimeout(r, 1400));
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <motion.div className="w-full max-w-sm" variants={fadeUp} initial="hidden" animate="visible">
        <div className="rounded-xl border border-gray-700 bg-[#1a1f2e] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-900/40">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-indigo-400">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
          </div>
          <h2 className="mb-1 text-base font-semibold text-gray-100">Check your inbox</h2>
          <p className="mb-1 text-xs text-gray-500">We sent a reset link to</p>
          <p className="mb-6 text-xs font-medium text-gray-300">{email}</p>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Back to sign in
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="w-full max-w-sm" variants={fadeUp} initial="hidden" animate="visible">
      <div className="rounded-xl border border-gray-700 bg-[#1a1f2e] p-8 shadow-2xl">

        {/* Logo + heading */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-900/40">
            <svg viewBox="0 0 16 16" fill="white" className="h-5 w-5">
              <path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 1.5L14 6v4.5L8 14 2 10.5V6L8 2.5z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-100">Reset your password</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-gray-400">Email</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-500">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
              </span>
              <input
                id="email" type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="you@example.com" autoComplete="email"
                className={`w-full rounded-lg border bg-[#0f1419] py-2.5 pl-9 pr-4 text-sm text-gray-100 placeholder-gray-600 outline-none transition-colors focus:ring-2 ${
                  error
                    ? "border-red-500/60 focus:border-red-500 focus:ring-red-900/40"
                    : "border-gray-700 focus:border-indigo-500 focus:ring-indigo-900/40"
                }`}
              />
            </div>
            <AnimatePresence>
              {error && (
                <motion.p className="text-xs text-red-400"
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }} transition={{ duration: duration.fast }}>
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            type="submit" disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            whileTap={!loading ? buttonTap : {}}
            transition={{ duration: duration.fast }}
          >
            {loading ? <><Spinner />Sending…</> : "Send reset link"}
          </motion.button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          Remember your password?{" "}
          <Link href="/login" className="font-medium text-indigo-400 transition-colors hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
