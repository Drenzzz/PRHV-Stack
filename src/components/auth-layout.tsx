import logoUrl from "../assets/logo.svg";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,var(--primary-foreground)_0,transparent_35%),radial-gradient(circle_at_80%_90%,var(--primary-foreground)_0,transparent_30%)] opacity-15"
        />
        <a href="/" className="relative flex items-center gap-2">
          <img src={logoUrl} height={32} width={32} alt="logo" className="invert" />
          <span className="font-heading text-lg font-semibold tracking-tight">My Vike app</span>
        </a>
        <blockquote className="relative space-y-2">
          <p className="font-heading text-2xl font-medium tracking-tight text-balance">
            &ldquo;Authentication, dashboard, and database — already wired. Start from here, not from zero.&rdquo;
          </p>
          <footer className="text-sm opacity-70">The template README you wish you had</footer>
        </blockquote>
      </div>
    </div>
  );
}
