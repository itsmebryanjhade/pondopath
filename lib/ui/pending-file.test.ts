import { describe, expect, it } from "vitest";
import * as holder from "./pending-file";

describe("pending file holder", () => {
  it("takePendingFile returns the stored file once then null", () => {
    const file = new File(["x"], "a.csv");
    holder.setPendingFile(file);
    expect(holder.takePendingFile()).toBe(file);
    expect(holder.takePendingFile()).toBeNull();
  });
  it("setPendingFile replaces an earlier file", () => {
    const first = new File(["x"], "a.csv"), second = new File(["y"], "b.xlsx");
    holder.setPendingFile(first);
    holder.setPendingFile(second);
    expect(holder.takePendingFile()).toBe(second);
  });
  it("only exposes memory functions, nothing that writes to storage or the URL", () => {
    expect(Object.keys(holder).sort()).toEqual(["setPendingFile", "takePendingFile"]);
  });
});
