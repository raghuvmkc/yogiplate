/**
 * @deprecated Prefer lean prompt + load_skill tools from `@/lib/chat/skills`.
 * Kept so older imports do not break during transition.
 */
export {
  buildLeanFrontDeskSystemPrompt as buildFrontDeskSystemPrompt,
} from "@/lib/chat/skills";
