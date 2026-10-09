import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { alertNotifyEmails, sendSystemAlertEmail } from "@/lib/smtp";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";

export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await sendSystemAlertEmail({
      subject: "Yogiplate site monitor: test alert",
      text: [
        "This is a test from the Yogiplate Health page.",
        "If you got this, you will also get an email when a customer hits an error.",
        "",
        `Health page: ${siteUrl()}/admin/health`,
      ].join("\n"),
    });
    return NextResponse.json({ ok: true, to: alertNotifyEmails().join(", ") });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send the test alert." },
      { status: 500 }
    );
  }
}
