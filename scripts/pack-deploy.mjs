import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.join(root, "deploy", "yogiplate-site");

const files = [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "next-env.d.ts",
  "netlify.toml",
  ".env.example",
];

const dirs = ["src", "public", "supabase"];

function rmDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(rel) {
  const from = path.join(root, rel);
  if (!fs.existsSync(from)) return;
  const to = path.join(out, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(rel) {
  const from = path.join(root, rel);
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, path.join(out, rel), { recursive: true });
}

rmDir(out);
fs.mkdirSync(out, { recursive: true });

for (const f of files) copyFile(f);
for (const d of dirs) copyDir(d);

const readme = `YOGIPLATE — DEPLOY THIS FOLDER TO NETLIFY
========================================

This folder is a clean copy of only what Netlify needs.
(No node_modules, no .next, no YogiplateKT, no secrets.)

HOW TO DEPLOY
-------------
1. Open Netlify → Sites → Add new site → Import an existing project
   OR use "Deploy manually" / drag & drop (Git is more reliable for Next.js).

2. If using GitHub/Git:
   - Push the main Yogiplate project (or just this folder as a repo)
   - Base directory: leave blank if this folder is the repo root
   - Build command: npm run build
   - Publish directory: leave as Netlify detects (netlify.toml is included)

3. After first deploy, open Site settings → Environment variables and add:
   GEMINI_API_KEY=your_key_here
   (optional) OWNER_WHATSAPP_E164=14085551234
   (optional) NEXT_PUBLIC_SITE_URL=https://your-site.netlify.app

4. Trigger a Redeploy so the AI chat picks up the key.

5. Share the free URL Netlify gives you, like:
   https://something.netlify.app

REFRESH THIS FOLDER AFTER CODE CHANGES
--------------------------------------
From the main Yogiplate project, run:

  npm run pack-deploy

Then deploy the updated deploy/yogiplate-site folder again.
`;

fs.writeFileSync(path.join(out, "README-DEPLOY.txt"), readme, "utf8");
fs.writeFileSync(
  path.join(root, "deploy", "START-HERE.txt"),
  `Open the folder named:  yogiplate-site

That is the only folder you upload / connect for Netlify.

If yogiplate-site is missing or outdated, run this in the main project:

  npm run pack-deploy
`,
  "utf8"
);

console.log(`Packed deploy folder → ${out}`);
