'use client';

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        The war room hit an unexpected error. Your incident data is safe on the multi-region
        database. Try again, and if a region was forced down, restore it.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md border border-line bg-raised px-3 py-2 text-sm hover:border-accent"
      >
        Retry
      </button>
    </main>
  );
}
