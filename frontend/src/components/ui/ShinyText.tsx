"use client";

interface ShinyTextProps {
  text: string;
  className?: string;
  speed?: number;
  disabled?: boolean;
}

export function ShinyText({
  text,
  className = "",
  speed = 3,
  disabled = false,
}: ShinyTextProps) {
  const animStyle = disabled
    ? {}
    : {
        backgroundImage:
          "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.65) 50%, transparent 70%)",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        animation: `shiny-sweep ${speed}s linear infinite`,
      };

  return (
    <>
      <style>{`
        @keyframes shiny-sweep {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
      <span className={`inline-block ${className}`} style={animStyle}>
        {text}
      </span>
    </>
  );
}
