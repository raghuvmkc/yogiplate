"use client";

import { FormEvent, useState } from "react";

type Status = "idle" | "sending" | "success" | "error";

const inputClass =
  "mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent";

export function ContactMessageForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [feedback, setFeedback] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setFeedback("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, message, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setFeedback(data.error || "Something went wrong.");
        return;
      }
      setStatus("success");
      setFeedback(
        data.message ||
          "Your message is sent. Our store manager will respond to your message."
      );
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
    } catch {
      setStatus("error");
      setFeedback("Could not send your message. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        className="border-2 border-accent/40 bg-accent-soft px-6 py-8 sm:px-8"
        role="status"
      >
        <p className="eyebrow">Message sent</p>
        <h2 className="font-display mt-3 text-3xl text-foreground sm:text-4xl">
          Thank you
        </h2>
        <p className="mt-4 text-base font-semibold leading-relaxed text-accent-deep">
          {feedback ||
            "Your message is sent. Our store manager will respond to your message."}
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setFeedback("");
          }}
          className="mt-6 text-sm font-semibold text-accent-deep underline underline-offset-2"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-2 border-line bg-white p-6 sm:p-8"
      noValidate
    >
      <p className="eyebrow">Quick message</p>
      <h2 className="font-display mt-3 text-3xl text-foreground sm:text-4xl">
        Send us a note
      </h2>
      <p className="mt-3 text-base font-medium text-muted">
        Share your name, email, and phone — we&apos;ll reply at{" "}
        support@yogiplate.com.
      </p>

      <label className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        Website
        <input
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </label>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="font-semibold text-foreground">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoComplete="name"
            placeholder="Your name"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-foreground">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            autoComplete="email"
            placeholder="you@email.com"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-foreground">Phone</span>
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            autoComplete="tel"
            placeholder="(408) 555-0100"
            pattern="[\d\s()+.\-]{10,}"
            title="Enter a phone number with at least 10 digits."
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-semibold text-foreground">Message</span>
          <textarea
            required
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={inputClass}
            placeholder="How can we help with your catering?"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-8 w-full bg-accent-deep px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-60 sm:w-auto"
      >
        {status === "sending" ? "Sending…" : "Send message"}
      </button>

      {feedback && status === "error" ? (
        <p className="mt-4 text-sm font-medium text-red-700" role="alert">
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
