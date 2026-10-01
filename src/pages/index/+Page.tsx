import { IconChartBar, IconDatabase, IconLock } from "@tabler/icons-react";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { cn } from "cn";
import logoUrl from "../../assets/logo.svg";

const features = [
  {
    Icon: IconLock,
    title: "Email authentication",
    description: "Sign up, log in, and sessions — powered by Better Auth with a Drizzle Postgres store.",
  },
  {
    Icon: IconChartBar,
    title: "Dashboard included",
    description: "Sidebar, charts, and data tables from shadcn/ui blocks, ready to extend.",
  },
  {
    Icon: IconDatabase,
    title: "SSR + database",
    description: "Vike server rendering with Hono and Drizzle. Data loads on the server, hydrates on the client.",
  },
];

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between p-5">
        <a href="/" className="flex items-center gap-2">
          <img src={logoUrl} height={32} width={32} alt="logo" />
          <span className="font-heading text-lg font-semibold tracking-tight">My Vike app</span>
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
          <Badge>Template</Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Start your app from here, not from zero
          </h1>
          <p className="text-lg text-muted-foreground text-balance">
            Landing page, authentication, and dashboard — already wired with Vike, Hono, Drizzle,
            and shadcn/ui.
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
        Built with Vike, Hono, Drizzle, Better Auth, and shadcn/ui.
      </footer>
    </div>
  );
}
