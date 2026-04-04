export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 py-14 text-center">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
