/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sora)", "ui-sans-serif", "sans-serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        accent: {
          DEFAULT: "#ffffff",
          strong:  "#f4f4f5",
          dim:     "rgba(255,255,255,0.1)",
        },
      },
      boxShadow: {
        card:          "0 1px 3px rgba(0,0,0,0.5)",
        "card-hover":  "0 4px 12px rgba(0,0,0,0.5)",
        "glow-accent": "0 0 0 1px rgba(255,255,255,0.2), 0 8px 24px rgba(255,255,255,0.05)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
      },
      animation: {
        "fade-up":   "fade-up 0.4s ease forwards",
        "fade-in":   "fade-in 0.3s ease forwards",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
};
