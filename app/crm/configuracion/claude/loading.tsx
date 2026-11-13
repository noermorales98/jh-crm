export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-40 animate-pulse rounded-control bg-surface-panel" />
      <div className="h-40 animate-pulse rounded-surface bg-surface-panel" />
      <div className="h-24 animate-pulse rounded-surface bg-surface-panel" />
    </div>
  );
}
