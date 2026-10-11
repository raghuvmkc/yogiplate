/** Window event that opens the AI Yogi chat widget from anywhere on the site. */
export const OPEN_CHAT_EVENT = "yogiplate:open-chat";

export function openAiYogiChat() {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}
