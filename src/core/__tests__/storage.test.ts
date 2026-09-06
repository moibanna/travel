import { describe, expect, it } from "vitest";
import { mergeIntoBase } from "../storage";
import { BLANK, type MovementRecord } from "../types";

function rec(id: string, over: Partial<MovementRecord> = {}): MovementRecord {
  return { ...BLANK, id, no: Number(id.replace(/\D/g, "")) || 1, ...over } as MovementRecord;
}

describe("mergeIntoBase", () => {
  it("keeps a colleague's edit to a different record", () => {
    // Zana is saving a change to r1. Meanwhile Idrees has already saved r2.
    const stored = [rec("r1", { name: "Old" }), rec("r2", { name: "Idrees edit" })];
    const merged = mergeIntoBase(stored, { upsert: [rec("r1", { name: "Zana edit" })] });

    expect(merged.find((r) => r.id === "r1")!.name).toBe("Zana edit");
    expect(merged.find((r) => r.id === "r2")!.name).toBe("Idrees edit");
  });

  it("keeps a record a colleague added while this edit was open", () => {
    const stored = [rec("r1"), rec("r9", { name: "Added by someone else" })];
    const merged = mergeIntoBase(stored, { upsert: [rec("r1", { name: "Mine" })] });

    expect(merged).toHaveLength(2);
    expect(merged.some((r) => r.id === "r9")).toBe(true);
  });

  it("puts a newly created record at the front", () => {
    const merged = mergeIntoBase([rec("r1")], { upsert: [rec("r5", { name: "New" })] });
    expect(merged[0].id).toBe("r5");
  });

  it("removes what the caller deleted and nothing else", () => {
    const stored = [rec("r1"), rec("r2"), rec("r3")];
    const merged = mergeIntoBase(stored, { remove: ["r2"] });
    expect(merged.map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("applies a delete and an add together", () => {
    const stored = [rec("r1"), rec("r2")];
    const merged = mergeIntoBase(stored, { remove: ["r1"], upsert: [rec("r7")] });
    expect(merged.map((r) => r.id).sort()).toEqual(["r2", "r7"]);
  });

  it("treats an empty store as a clean start", () => {
    expect(mergeIntoBase(null, { upsert: [rec("r1")] })).toHaveLength(1);
    expect(mergeIntoBase([], { upsert: [rec("r1")] })).toHaveLength(1);
  });

  it("does not resurrect a record someone else deleted", () => {
    // r2 is gone from the store; this change never mentions it, so it stays gone.
    const merged = mergeIntoBase([rec("r1")], { upsert: [rec("r1", { name: "Mine" })] });
    expect(merged.some((r) => r.id === "r2")).toBe(false);
  });

  it("ignores a delete for something already gone", () => {
    const merged = mergeIntoBase([rec("r1")], { remove: ["r99"] });
    expect(merged.map((r) => r.id)).toEqual(["r1"]);
  });
});
