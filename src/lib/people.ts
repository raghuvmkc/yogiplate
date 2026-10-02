/**
 * Single source for chef / manager display names used by AI Yogi.
 * Configure in .env — do not hardcode names in agent prompts.
 */

function env(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

export type YogiPeople = {
  chefName: string;
  chefTitle: string;
  chefPrefix: string;
  managerName: string;
  managerTitle: string;
};

export function getYogiPeople(): YogiPeople {
  return {
    chefName: env("CHEF_FOUNDER_NAME", "Radhavallabh"),
    chefTitle: env("CHEF_FOUNDER_TITLE", "Chef and Founder"),
    chefPrefix: env("CHEF_FOUNDER_PREFIX", "Mr."),
    managerName: env("MANAGER_NAME", "Raghu"),
    managerTitle: env("MANAGER_TITLE", "Restaurant Manager"),
  };
}

/** e.g. "Mr. Radhavallabh" */
export function chefFormalName(p: YogiPeople = getYogiPeople()): string {
  const prefix = p.chefPrefix.replace(/\s+/g, " ").trim();
  const name = p.chefName.replace(/\s+/g, " ").trim();
  return prefix ? `${prefix} ${name}` : name;
}

/** e.g. "Mr. Radhavallabh (Chef and Founder)" */
export function chefWithTitle(p: YogiPeople = getYogiPeople()): string {
  return `${chefFormalName(p)} (${p.chefTitle})`;
}

/** e.g. "Raghu" */
export function managerFormalName(p: YogiPeople = getYogiPeople()): string {
  return p.managerName.replace(/\s+/g, " ").trim() || "the restaurant manager";
}

/** e.g. "Raghu (Restaurant Manager)" */
export function managerWithTitle(p: YogiPeople = getYogiPeople()): string {
  const name = managerFormalName(p);
  return p.managerTitle ? `${name} (${p.managerTitle})` : name;
}

/** Spoken / guest-facing handoff team: "Mr. Radhavallabh and Raghu" */
export function handoffTeamPhrase(p: YogiPeople = getYogiPeople()): string {
  return `${chefFormalName(p)} and ${managerFormalName(p)}`;
}

/** Escape a string for use inside a RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
