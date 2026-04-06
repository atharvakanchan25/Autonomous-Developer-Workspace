/**
 * Motion design tokens and reusable Framer Motion variants.
 *
 * Philosophy: every animation must answer "what changed, where, and why."
 * Nothing moves without purpose. Nothing lingers.
 */

// ── Duration tokens (ms) ─────────────────────────────────────────────────────

export const duration = {
  fast:     0.13,   // micro-interactions: button press, dot state
  standard: 0.20,   // most UI transitions: card hover, badge change
  slow:     0.30,   // panel open/close, page enter
  crawl:    0.50,   // number count-up, progress fill
} as const;

// ── Easing tokens ────────────────────────────────────────────────────────────

export const ease = {
  primary: [0.4, 0, 0.2, 1] as const,   // ease-in-out — state changes
  enter:   [0, 0, 0.2, 1]  as const,   // ease-out    — elements entering
  exit:    [0.4, 0, 1, 1]  as const,   // ease-in     — elements leaving
} as const;

// ── Shared variants ──────────────────────────────────────────────────────────

/** Fade + subtle upward entry. Used for list items, log lines, cards. */
export const fadeUp = {
  hidden:  { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.standard, ease: ease.enter } },
  exit:    { opacity: 0, y: -4, transition: { duration: duration.fast, ease: ease.exit } },
};

/** Fade only — for overlays, tooltips, status badges. */
export const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.standard, ease: ease.enter } },
  exit:    { opacity: 0, transition: { duration: duration.fast, ease: ease.exit } },
};

/** Slide in from the right — for side panels, log drawers. */
export const slideInRight = {
  hidden:  { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: { duration: duration.slow, ease: ease.enter } },
  exit:    { opacity: 0, x: 16, transition: { duration: duration.standard, ease: ease.exit } },
};

/** Slide in from the left — for file explorer, left panels. */
export const slideInLeft = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: duration.slow, ease: ease.enter } },
  exit:    { opacity: 0, x: -16, transition: { duration: duration.standard, ease: ease.exit } },
};

/** Page-level entry — fade + very slight upward drift. */
export const pageEnter = {
  hidden:  { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.slow, ease: ease.enter },
  },
};

/** Stagger container — wraps lists so children animate in sequence. */
export const staggerContainer = {
  hidden:  {},
  visible: {
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.05,
    },
  },
};

/** Scale pop — for checkmarks, success icons, completion states. */
export const scalePop = {
  hidden:  { opacity: 0, scale: 0.88 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.standard, ease: ease.enter },
  },
};

/** Status change — smooth color/opacity crossfade for badge transitions. */
export const statusTransition = {
  transition: { duration: duration.standard, ease: ease.primary },
};

/** Card hover lift — applied via whileHover on motion.div. */
export const cardHover = {
  y: -2,
  boxShadow: "0 4px 16px 0 rgba(0,0,0,0.08), 0 1px 4px 0 rgba(0,0,0,0.04)",
  transition: { duration: duration.fast, ease: ease.enter },
};

/** Button press — scale down on tap/click. */
export const buttonTap = { scale: 0.97 };

/** Running pulse — opacity breathe for active/in-progress states. */
export const runningPulse = {
  animate: {
    opacity: [0.65, 1, 0.65],
    transition: {
      duration: 1.6,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "loop" as const,
    },
  },
};

/** Pipeline connector fill — animates a line from 0% to 100% width. */
export const connectorFill = {
  hidden:  { scaleX: 0, originX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: duration.crawl, ease: ease.enter },
  },
};
