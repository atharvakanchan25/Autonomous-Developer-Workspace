interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "gray" | "green" | "blue" | "red" | "yellow";
}

const ACCENTS = {
  gray:   "border-l-gray-400",
  green:  "border-l-green-500",
  blue:   "border-l-blue-500",
  red:    "border-l-red-500",
  yellow: "border-l-yellow-500",
};

export function StatCard({ label, value, sub, accent = "gray" }: StatCardProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-5 border-l-4 ${ACCENTS[accent]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
