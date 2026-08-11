/**
 * Verifies the isolated behavior of editing history.
 */

import { describe, expect, it } from "vitest";
import { commitEditingHistory, createEditingHistory, redoEditingHistory, undoEditingHistory } from "@/components/admin/builder/editing-history";

describe("editor undo and redo history", () => {
  it("walks backward and forward through committed states", () => {
    let history = createEditingHistory({ title: "Initial" });
    history = commitEditingHistory(history, { title: "Second" });
    history = commitEditingHistory(history, { title: "Third" });

    history = undoEditingHistory(history);
    expect(history.present.title).toBe("Second");
    history = undoEditingHistory(history);
    expect(history.present.title).toBe("Initial");
    history = redoEditingHistory(history);
    expect(history.present.title).toBe("Second");
  });

  it("clears redo states when a new edit is committed", () => {
    let history = commitEditingHistory(createEditingHistory("one"), "two");
    history = undoEditingHistory(history);
    history = commitEditingHistory(history, "replacement");

    expect(history.future).toEqual([]);
    expect(redoEditingHistory(history)).toBe(history);
  });
});
