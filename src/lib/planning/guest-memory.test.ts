/**
 * Starter tests for guest memory ops (run: npm run test:planning).
 * Uses Node assert — no vitest dependency.
 */
import assert from "node:assert/strict";
import {
  applyMemoryOps,
  emptyGuestMemory,
  recomputeConflicts,
} from "./guest-memory";

function base() {
  return emptyGuestMemory({
    event_id: "gev_test",
    session_id: "sess_test",
    customer_email: "guest@example.com",
  });
}

function testCorrectionWithoutDuplication() {
  const m = base();
  let r = applyMemoryOps(m, [
    { op: "update", path: "requirement_groups", key: "jain", value: 2 },
  ]);
  assert.equal(r.memory.requirement_groups.length, 1);
  assert.equal(r.memory.requirement_groups[0].count, 2);
  r = applyMemoryOps(r.memory, [
    { op: "update", path: "requirement_groups", key: "jain", value: 3 },
  ]);
  assert.equal(r.memory.requirement_groups.length, 1, "must upsert not duplicate");
  assert.equal(r.memory.requirement_groups[0].count, 3);
  assert.equal(
    r.memory.headcount.segments.find((s) => s.key === "jain")?.count,
    3
  );
  console.log("ok — correction without duplication (Jain 2 → 3)");
}

function testHeadcountConflict() {
  const m = base();
  const r = applyMemoryOps(m, [
    { op: "update", path: "headcount", value: 10 },
    { op: "update", path: "headcount.segments", key: "adults", value: 8 },
    { op: "update", path: "headcount.segments", key: "kids", value: 5 },
  ]);
  assert.ok(r.conflicts.length >= 1, "expected headcount conflict");
  assert.match(r.conflicts[0], /Headcount conflict/);
  // Also recomputeConflicts standalone
  const again = recomputeConflicts(r.memory);
  assert.ok(again.length >= 1);
  console.log("ok — headcount conflict (total vs segments)");
}

function testIndirectExtractionOps() {
  const m = base();
  const r = applyMemoryOps(m, [
    { op: "update", path: "headcount", value: 25 },
    {
      op: "update",
      path: "requirement_groups",
      key: "allergy",
      value: { count: 1, allergen: "cashew" },
    },
    { op: "update", path: "requirement_groups", key: "vegan", value: 25 },
    { op: "add", path: "declined_suggestions", value: "Chili Paneer" },
    {
      op: "ask_clarification",
      path: "open_questions",
      message: "Any kids attending?",
    },
  ]);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.applied, 5);
  assert.equal(r.memory.headcount.total, 25);
  const allergy = r.memory.requirement_groups.find((g) => g.kind === "allergy");
  assert.ok(allergy);
  assert.equal(allergy!.allergen, "cashew");
  assert.equal(allergy!.count, 1);
  assert.equal(
    r.memory.requirement_groups.find((g) => g.kind === "vegan")?.count,
    25
  );
  assert.deepEqual(r.memory.declined_suggestions, ["Chili Paneer"]);
  assert.equal(r.clarifications.length, 1);
  // Invalid enum rejected
  const bad = applyMemoryOps(r.memory, [
    { op: "update", path: "requirement_groups", key: "not_a_diet", value: 1 },
  ]);
  assert.ok(bad.errors.some((e) => /Invalid requirement/.test(e)));
  console.log("ok — indirect extraction ops applied by validator");
}

function testRequirementExceedsTotal() {
  const m = base();
  const r = applyMemoryOps(m, [
    { op: "update", path: "headcount", value: 5 },
    { op: "update", path: "requirement_groups", key: "jain", value: 8 },
  ]);
  assert.ok(
    r.conflicts.some((c) => /exceeds total/.test(c)),
    "jain count > total should conflict"
  );
  console.log("ok — requirement exceeds total headcount");
}

testCorrectionWithoutDuplication();
testHeadcountConflict();
testIndirectExtractionOps();
testRequirementExceedsTotal();
console.log("\nAll guest-memory tests passed.");
