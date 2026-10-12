"use client";

import { openAiYogiChat } from "@/lib/chat-events";

export function TalkToAiYogiButton() {
  return (
    <button
      type="button"
      onClick={openAiYogiChat}
      className="mt-6 inline-flex rounded-2xl bg-accent-deep px-7 py-3 text-base font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-accent hover:shadow-md"
    >
      Chat with AI Yogi
    </button>
  );
}
