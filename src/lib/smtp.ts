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
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}) {
  const boundary = `yp_${Date.now().toString(36)}`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(", ")}`,
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
