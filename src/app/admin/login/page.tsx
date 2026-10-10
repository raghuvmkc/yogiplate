"use client";

import { FormEvent, use, useState } from "react";
import { useRouter } from "next/navigation";

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/admin") || value.startsWith("//")) return "/admin";
  if (value.startsWith("/admin/login")) return "/admin";
  return value;
}

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; locked?: string }>;
}) {
  const params = use(searchParams);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setError("Invalid email or password.");
      return;
    }
    router.push(safeNext(params.next));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <h1
        className="text-4xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Admin login
      </h1>
      {params.locked ? (
        <p className="mt-4 border border-line bg-warm px-3 py-2 text-sm text-foreground">
          The admin locked after 30 minutes without activity. Enter the admin password to continue.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          className="w-full bg-accent-deep py-3 text-sm font-semibold text-white"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
