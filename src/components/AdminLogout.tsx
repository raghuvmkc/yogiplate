"use client";

import { useRouter } from "next/navigation";

export function AdminLogout() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-muted hover:text-accent-deep"
      onClick={async () => {
        await fetch("/api/admin/auth", { method: "DELETE" });
        router.push("/admin/login");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
