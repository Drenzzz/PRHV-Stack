import { useState } from "react";
import { AuthLayout } from "../../components/auth-layout";
import { LoginForm } from "../../components/login-form";
import { signIn } from "../../lib/auth-client";
import { formString } from "../../lib/form";

// Where to land after sign-in: honour ?next= (session expired mid-task) but
// never allow an off-site redirect (open-redirect guard).
function nextDestination(): string {
  const param = new URLSearchParams(window.location.search).get("next");
  if (param && param.startsWith("/") && !param.startsWith("//")) return param;
  return "/dashboard";
}

export default function Page() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(ev.currentTarget);
    const { error } = await signIn.email({
      email: formString(form, "email"),
      password: formString(form, "password"),
    });
    if (error) {
      setError(error.message ?? "Failed to log in. Check your credentials.");
      setPending(false);
    } else {
      window.location.href = nextDestination();
    }
  }

  return (
    <AuthLayout>
      <LoginForm onSubmit={handleSubmit} error={error} pending={pending} />
    </AuthLayout>
  );
}
