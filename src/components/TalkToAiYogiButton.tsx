"use client";

import { openAiYogiChat } from "@/lib/chat-events";

export function TalkToAiYogiButton() {
  return (
    <button
      type="button"
      onClick={openAiYogiChat}
      className="mt-6 inline-flex bg-accent-deep px-7 py-3 text-base font-semibold text-white transition hover:bg-accent"
    >
      Chat with AI Yogi
    </button>
  );
}
