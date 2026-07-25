export function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Welcome to your academy workspace.
      </p>

      <div className="mt-6 flex min-h-[60vh] items-center justify-center rounded-xl border border-dashed">
        <div className="text-muted-foreground text-center text-sm">
          <p>Nothing here yet.</p>
          <p className="mt-1">
            Notes, courses, enrollment, assessments &amp; invoices will live
            here.
          </p>
        </div>
      </div>
    </div>
  )
}
