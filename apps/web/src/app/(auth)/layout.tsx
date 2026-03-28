export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#0f1419] px-4">
      {children}
    </div>
  );
}
