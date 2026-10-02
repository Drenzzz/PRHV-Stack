import { IconChartBar, IconActivity, IconBell } from "@tabler/icons-react";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { cn } from "cn";
import logoUrl from "../../assets/logo.svg";

const features = [
  {
    Icon: IconActivity,
    title: "Contract-checked probes",
    description: "HTTP/HTTPS checks that verify expected status and body keywords — not just a ping.",
  },
  {
    Icon: IconChartBar,
    title: "Percentile latency",
    description: "p50, p95, and p99 over selectable windows, backed by time-series rollups.",
  },
  {
    Icon: IconBell,
    title: "Debounced Telegram alerts",
    description: "Incidents open after repeated failures and recover quietly — no alert fatigue.",
  },
];

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between p-5">
        <a href="/" className="flex items-center gap-2">
          <img src={logoUrl} height={32} width={32} alt="logo" />
          <span className="font-heading text-lg font-semibold tracking-tight">Lunite</span>
        </a>
        <nav className="flex items-center gap-2">
          <a href="/login" className={cn(buttonVariants({ variant: "ghost" }))}>
            Log in
          </a>
          <a href="/signup" className={cn(buttonVariants({ variant: "default" }))}>
            Get started
          </a>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 p-5 py-16">
        <div className="flex max-w-2xl flex-col items-start gap-5">
          <Badge>Monitoring</Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            The watch that never sleeps
          </h1>
          <p className="text-lg text-muted-foreground text-balance">
            HTTP uptime monitoring with contract checks, p50/p95/p99 latency, and debounced
            Telegram alerts. Public status pages included.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="/signup" className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
              Create account
            </a>
            <a href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Open dashboard
            </a>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {features.map(({ Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-muted">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl p-5 text-sm text-muted-foreground">
        Lunite — uptime &amp; latency monitoring.
      </footer>
    </div>
  );
}
