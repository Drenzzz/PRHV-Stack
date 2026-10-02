export default function Page() {
  // Placeholder shell — the monitor list lands in STEP-M3-04.
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 lg:px-6">
            <h2 className="text-base font-medium">Monitors</h2>
            <p className="text-sm text-muted-foreground">Loading monitors…</p>
          </div>
        </div>
      </div>
    </div>
  );
}
