import tls from "tls";

function env(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

/** Internal recipients — never expose to the browser. */
export function corporateNotifyEmails(): string[] {
  const raw =
    env("CORPORATE_NOTIFY_EMAILS") ||
    "raghuvmkc@gmail.com,rvdrns@gmail.com";
  return [
    ...new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function smtpConfigured() {
  return Boolean(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASSWORD"));
}

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function buildMime(opts: {
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}) {
  const boundary = `yp_${Date.now().toString(36)}`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(", ")}`,
    opts.cc?.length ? `Cc: ${opts.cc.join(", ")}` : "",
    opts.replyTo ? `Reply-To: ${opts.replyTo}` : "",
    `Subject: ${encodeSubject(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
    .filter(Boolean)
    .join("\r\n");

  return (
    `${headers}\r\n\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
    `${opts.text}\r\n\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n\r\n` +
    `${opts.html}\r\n\r\n` +
    `--${boundary}--\r\n`
  );
}

function createSmtpSession(host: string, port: number) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host }, () =>
      resolve(socket)
    );
    socket.setEncoding("utf8");
    socket.once("error", reject);
  });
}

async function smtpConversation(
  socket: tls.TLSSocket,
  commands: { cmd?: string; expect: number }[]
) {
  let buffer = "";

  const readCode = () =>
    new Promise<string>((resolve, reject) => {
      const tryParse = () => {
        const normalized = buffer.replace(/\r\n/g, "\n");
        const lines = normalized.split("\n");
        // Find last complete reply line: "NNN message"
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (/^\d{3} /.test(line)) {
            const reply = lines.slice(0, i + 1).join("\n");
            buffer = lines.slice(i + 1).join("\n");
            resolve(reply);
            return true;
          }
        }
        return false;
      };

      if (tryParse()) return;

      const onData = (chunk: string) => {
        buffer += chunk;
        if (tryParse()) {
          socket.off("data", onData);
        }
      };
      const onErr = (err: Error) => {
        socket.off("data", onData);
        reject(err);
      };
      socket.on("data", onData);
      socket.once("error", onErr);
      setTimeout(() => {
        socket.off("data", onData);
        reject(new Error("SMTP timeout waiting for response"));
      }, 45000);
    });

  for (const step of commands) {
    if (step.cmd != null) {
      socket.write(step.cmd.endsWith("\r\n") ? step.cmd : `${step.cmd}\r\n`);
    }
    const reply = await readCode();
    if (!reply.startsWith(String(step.expect))) {
      throw new Error(`SMTP expected ${step.expect}, got: ${reply.trim()}`);
    }
  }
}

async function smtpSend(rawMessage: string, envelopeTo: string[]) {
  const host = env("SMTP_HOST", "mail.privateemail.com");
  const port = Number(env("SMTP_PORT") || "465");
  const user = env("SMTP_USER");
  const password = env("SMTP_PASSWORD");
  const fromEmail = user || env("KITCHEN_EMAIL", "support@stonecraftpizza.us");

  if (!user || !password) {
    throw new Error("SMTP is not configured.");
  }

  const socket = await createSmtpSession(host, port);
  try {
    const steps: { cmd?: string; expect: number }[] = [
      { expect: 220 },
      { cmd: "EHLO yogiplate.local", expect: 250 },
      { cmd: "AUTH LOGIN", expect: 334 },
      { cmd: Buffer.from(user).toString("base64"), expect: 334 },
      { cmd: Buffer.from(password).toString("base64"), expect: 235 },
      { cmd: `MAIL FROM:<${fromEmail}>`, expect: 250 },
    ];
    for (const to of envelopeTo) {
      steps.push({ cmd: `RCPT TO:<${to}>`, expect: 250 });
    }
    steps.push({ cmd: "DATA", expect: 354 });
    steps.push({ cmd: `${rawMessage}\r\n.`, expect: 250 });
    steps.push({ cmd: "QUIT", expect: 221 });
    await smtpConversation(socket, steps);
  } finally {
    socket.end();
  }
}

export async function sendCorporateInquiryEmail(input: {
  company: string;
  name: string;
  email: string;
  mobile: string;
  occasion: string;
  deliveryLocation: string;
  eventDate: string;
  guestCount?: string;
  dietPreference?: string;
  message?: string;
}) {
  const to = corporateNotifyEmails();
  if (!to.length) throw new Error("No notify recipients configured.");

  const fromEmail = env("SMTP_USER") || "support@stonecraftpizza.us";
  const fromName = env("SMTP_FROM_NAME") || "Yogiplate Corporate Catering";
  const from = `${fromName} <${fromEmail}>`;

  const subject = `Corporate catering inquiry — ${input.company || input.name}`;
  const lines = [
    "New corporate catering inquiry from the Yogiplate website",
    "",
    `Company: ${input.company}`,
    `Contact name: ${input.name}`,
    `Email: ${input.email}`,
    `Mobile: ${input.mobile}`,
    `Occasion: ${input.occasion}`,
    `Delivery location: ${input.deliveryLocation}`,
    `Delivery / event date: ${input.eventDate}`,
    `Guest count: ${input.guestCount || "—"}`,
    `Diet preference: ${input.dietPreference || "—"}`,
    `Message: ${input.message || "—"}`,
    "",
    "Reply directly to this email to contact the requester.",
  ];
  const text = lines.join("\n");
  const esc = (v: string) =>
    String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const html = `
    <div style="font-family:Georgia,serif;color:#2a4a36;line-height:1.55">
      <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#3d6b4f;margin:0 0 8px">Corporate catering</p>
      <h2 style="margin:0 0 16px;font-size:24px">New inquiry</h2>
      <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:15px">
        ${[
          ["Company", input.company],
          ["Contact", input.name],
          ["Email", input.email],
          ["Mobile", input.mobile],
          ["Occasion", input.occasion],
          ["Delivery location", input.deliveryLocation],
          ["Event date", input.eventDate],
          ["Guests", input.guestCount || "—"],
          ["Diet preference", input.dietPreference || "—"],
          ["Message", input.message || "—"],
        ]
          .map(
            ([k, v]) =>
              `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #e8ebe9;vertical-align:top;font-weight:600">${k}</td><td style="padding:8px 0;border-top:1px solid #e8ebe9">${esc(String(v))}</td></tr>`
          )
          .join("")}
      </table>
      <p style="margin:20px 0 0;color:#3d6b4f;font-size:14px">Reply to this email to reach the requester directly.</p>
    </div>
  `;

  const raw = buildMime({
    from,
    to,
    replyTo: `${input.name} <${input.email}>`,
    subject,
    text,
    html,
  });

  await smtpSend(raw, to);
  return { ok: true as const };
}

/** Recipients for AI Yogi chat-end summaries (never returned to the browser). */
export function chatSummaryNotifyEmails(): string[] {
  const raw =
    env("CHAT_SUMMARY_NOTIFY_EMAILS") || "raghuvmkc@gmail.com";
  return [
    ...new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export async function sendChatSummaryEmail(input: {
  sessionId: string;
  name: string;
  phone: string;
  email: string;
  summary: string;
  transcript: { role: string; content: string }[];
  orderDraft?: Record<string, unknown> | null;
  cartHint?: string;
}) {
  const to = chatSummaryNotifyEmails();
  if (!to.length) throw new Error("No chat-summary recipients configured.");

  const fromEmail = env("SMTP_USER") || "support@stonecraftpizza.us";
  const fromName = env("SMTP_FROM_NAME") || "Yogiplate AI Yogi";
  const from = `${fromName} <${fromEmail}>`;

  const guestLabel = input.name || input.email || "Guest";
  const subject = `AI Yogi chat summary — ${guestLabel}`;

  const transcriptText = input.transcript
    .map((m) => `${m.role === "user" ? "Guest" : "AI Yogi"}: ${m.content}`)
    .join("\n\n");

  const text = [
    "AI Yogi chat ended — discussion summary",
    "",
    `Session: ${input.sessionId}`,
    `Name: ${input.name}`,
    `Phone: ${input.phone}`,
    `Email: ${input.email}`,
    input.cartHint ? `Cart: ${input.cartHint}` : null,
    "",
    "Summary:",
    input.summary || "(no summary)",
    "",
    "Transcript:",
    transcriptText || "(empty)",
    "",
    input.orderDraft
      ? `Order draft: ${JSON.stringify(input.orderDraft, null, 2)}`
      : null,
    "",
    "Reply to this email to reach the guest directly.",
  ]
    .filter((line) => line != null)
    .join("\n");

  const esc = (v: string) =>
    String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

  const html = `
    <div style="font-family:Georgia,serif;color:#2a4a36;line-height:1.55">
      <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#3d6b4f;margin:0 0 8px">AI Yogi</p>
      <h2 style="margin:0 0 16px;font-size:24px">Chat summary</h2>
      <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:15px">
        ${[
          ["Session", input.sessionId],
          ["Name", input.name],
          ["Phone", input.phone],
          ["Email", input.email],
          ["Cart", input.cartHint || "—"],
        ]
          .map(
            ([k, v]) =>
              `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #e8ebe9;vertical-align:top;font-weight:600">${k}</td><td style="padding:8px 0;border-top:1px solid #e8ebe9">${esc(String(v))}</td></tr>`
          )
          .join("")}
      </table>
      <h3 style="margin:24px 0 8px;font-size:18px">Summary</h3>
      <p style="margin:0;white-space:pre-wrap">${esc(input.summary || "(none)")}</p>
      <h3 style="margin:24px 0 8px;font-size:18px">Transcript</h3>
      <div style="margin:0;padding:12px;background:#f7f5f0;border:1px solid #e8ebe9;font-size:14px">${esc(transcriptText || "(empty)")}</div>
      <p style="margin:20px 0 0;color:#3d6b4f;font-size:14px">Reply to this email to reach the guest directly.</p>
    </div>
  `;

  const raw = buildMime({
    from,
    to,
    replyTo:
      input.email && input.name
        ? `${input.name} <${input.email}>`
        : input.email || undefined,
    subject,
    text,
    html,
  });

  await smtpSend(raw, to);
  return { ok: true as const, to_count: to.length };
}

/** Manager / chef notify list for live human handoffs. */
export function managerNotifyEmails(): string[] {
  const raw =
    env("MANAGER_NOTIFY_EMAILS") ||
    env("CORPORATE_NOTIFY_EMAILS") ||
    "raghuvmkc@gmail.com";
  return [
    ...new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

/** Who gets "something broke" emails. Technical alerts, so not the chef by default. */
export function alertNotifyEmails(): string[] {
  const raw =
    env("ALERT_NOTIFY_EMAILS") ||
    env("CHAT_SUMMARY_NOTIFY_EMAILS") ||
    "raghuvmkc@gmail.com";
  return [
    ...new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export async function sendSystemAlertEmail(input: { subject: string; text: string }) {
  if (!smtpConfigured()) throw new Error("SMTP is not configured");
  const to = alertNotifyEmails();
  const fromEmail = env("SMTP_USER") || "support@stonecraftpizza.us";
  const raw = buildMime({
    from: `Yogiplate Site Monitor <${fromEmail}>`,
    to,
    subject: input.subject,
    text: input.text,
    html: `<pre style="font-family:Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap">${input.text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</pre>`,
  });
  await smtpSend(raw, to);
}

/** Send a catering quote to the guest via Stone Craft SMTP (fallback when Resend is unset). */
export async function sendGuestQuoteSmtp(input: {
  to: string;
  cc?: string[];
  name: string;
  subject: string;
  text: string;
  html: string;
}) {
  if (!smtpConfigured()) {
    throw new Error("SMTP is not configured");
  }
  const to = [input.to.trim().toLowerCase()].filter(Boolean);
  if (!to.length) throw new Error("Missing guest email");
  const cc = [
    ...new Set(
      (input.cc || [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && !to.includes(e))
    ),
  ];

  const fromEmail = env("SMTP_USER") || "support@stonecraftpizza.us";
  const fromName = env("SMTP_FROM_NAME") || "Yogiplate Catering";
  const from = `${fromName} <${fromEmail}>`;

  const raw = buildMime({
    from,
    to,
    cc,
    replyTo: fromEmail,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  await smtpSend(raw, [...to, ...cc]);
  return { ok: true as const };
}

/** Email chef/manager notify list that a guest wants a human. */
export async function sendManagerHandoffEmail(input: {
  name: string;
  phone: string;
  email: string;
  summary: string;
  transcript?: { role: string; content: string }[];
  orderDraft?: Record<string, unknown> | null;
  quoteUrl?: string | null;
}) {
  if (!smtpConfigured()) {
    throw new Error("SMTP is not configured");
  }
  const to = managerNotifyEmails();
  if (!to.length) throw new Error("No manager notify emails configured.");

  const fromEmail = env("SMTP_USER") || "support@stonecraftpizza.us";
  const fromName = env("SMTP_FROM_NAME") || "Yogiplate AI Yogi";
  const from = `${fromName} <${fromEmail}>`;
  const guestLabel = input.name || input.email || "Guest";
  const subject = `Please call guest — ${guestLabel}`;

  const transcriptText = (input.transcript || [])
    .map((m) => `${m.role === "user" ? "Guest" : "AI Yogi"}: ${m.content}`)
    .join("\n\n");

  const text = [
    "A guest asked to speak with a person. Please reach out soon.",
    "",
    `Name: ${input.name}`,
    `Phone: ${input.phone}`,
    `Email: ${input.email}`,
    input.quoteUrl ? `Quote: ${input.quoteUrl}` : null,
    "",
    "Summary:",
    input.summary || "(none)",
    "",
    "Recent chat:",
    transcriptText || "(empty)",
    "",
    input.orderDraft
      ? `Order draft: ${JSON.stringify(input.orderDraft, null, 2)}`
      : null,
  ]
    .filter((line) => line != null)
    .join("\n");

  const esc = (v: string) =>
    String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

  const html = `
    <div style="font-family:Georgia,serif;color:#2a4a36;line-height:1.55">
      <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#3d6b4f;margin:0 0 8px">AI Yogi handoff</p>
      <h2 style="margin:0 0 16px;font-size:24px">Guest wants a person</h2>
      <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:15px">
        ${[
          ["Name", input.name],
          ["Phone", input.phone],
          ["Email", input.email],
          ["Quote", input.quoteUrl || "—"],
        ]
          .map(
            ([k, v]) =>
              `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #e8ebe9;vertical-align:top;font-weight:600">${k}</td><td style="padding:8px 0;border-top:1px solid #e8ebe9">${esc(String(v))}</td></tr>`
          )
          .join("")}
      </table>
      <h3 style="margin:24px 0 8px;font-size:18px">Summary</h3>
      <p style="margin:0;white-space:pre-wrap">${esc(input.summary || "(none)")}</p>
      <h3 style="margin:24px 0 8px;font-size:18px">Recent chat</h3>
      <div style="margin:0;padding:12px;background:#f7f5f0;border:1px solid #e8ebe9;font-size:14px">${esc(transcriptText || "(empty)")}</div>
      <p style="margin:20px 0 0;color:#3d6b4f;font-size:14px">Reply to this email or call the guest directly.</p>
    </div>
  `;

  const raw = buildMime({
    from,
    to,
    replyTo:
      input.email && input.name
        ? `${input.name} <${input.email}>`
        : input.email || undefined,
    subject,
    text,
    html,
  });

  await smtpSend(raw, to);
  return { ok: true as const, to_count: to.length };
}
