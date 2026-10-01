import { useState } from "react";
import { AuthLayout } from "../../components/auth-layout";
import { SignupForm } from "../../components/signup-form";
import { signUp } from "../../lib/auth-client";
import { formString } from "../../lib/form";

export default function Page() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError("");
    const form = new FormData(ev.currentTarget);
    const name = formString(form, "name");
    const email = formString(form, "email");
    const password = formString(form, "password");
    if (password !== formString(form, "confirmPassword")) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    const { error } = await signUp.email({ name, email, password });
    if (error) {
      setError(error.message ?? "Failed to create account. Try another email.");
      setPending(false);
    } else {
      window.location.href = "/dashboard";
    }
  }

  return (
    <AuthLayout>
      <SignupForm onSubmit={handleSubmit} error={error} pending={pending} />
    </AuthLayout>
  );
}
