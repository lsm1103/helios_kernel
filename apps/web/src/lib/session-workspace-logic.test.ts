import test from "node:test";
import assert from "node:assert/strict";
import { buildToolCardSummary, filterSessionsByArchive } from "./session-workspace-logic.ts";

test("filterSessionsByArchive keeps active sessions by default", () => {
  const rows = [
    { status: "ACTIVE" as const, id: "s1" },
    { status: "ARCHIVED" as const, id: "s2" }
  ];

  const result = filterSessionsByArchive(rows, false);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "s1");
});

test("filterSessionsByArchive returns all when archived is enabled", () => {
  const rows = [
    { status: "ACTIVE" as const, id: "s1" },
    { status: "ARCHIVED" as const, id: "s2" }
  ];

  const result = filterSessionsByArchive(rows, true);
  assert.equal(result.length, 2);
});

test("buildToolCardSummary picks latest non-empty output", () => {
  const summary = buildToolCardSummary(
    [{ data: "" }, { data: "  " }, { data: "final answer: done" }],
    "fallback"
  );
  assert.equal(summary, "final answer: done");
});

test("buildToolCardSummary uses fallback when all outputs are empty", () => {
  const summary = buildToolCardSummary([{ data: "" }, { data: " " }], "fallback");
  assert.equal(summary, "fallback");
});
