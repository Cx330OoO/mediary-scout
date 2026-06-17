import { describe, expect, it } from "vitest";
import { collapseToRanges } from "./episode-ranges";

describe("collapseToRanges", () => {
  it("returns [] for no codes", () => {
    expect(collapseToRanges([])).toEqual([]);
  });

  it("keeps a single code as-is", () => {
    expect(collapseToRanges(["E05"])).toEqual(["E05"]);
  });

  it("collapses a contiguous run into one range", () => {
    expect(collapseToRanges(["E01", "E02", "E03"])).toEqual(["E01–E03"]);
  });

  it("splits at gaps", () => {
    expect(collapseToRanges(["E01", "E03"])).toEqual(["E01", "E03"]);
  });

  it("sorts unordered input before collapsing", () => {
    expect(collapseToRanges(["E03", "E01", "E02"])).toEqual(["E01–E03"]);
  });

  it("handles the 凡人 case (long run + singletons + run)", () => {
    const codes = [
      ...Array.from({ length: 164 }, (_, i) => `E${String(i + 1).padStart(2, "0")}`),
      "E170",
      "E175",
      "E176",
      "E177",
      "E178",
    ];
    expect(collapseToRanges(codes)).toEqual(["E01–E164", "E170", "E175–E178"]);
  });

  it("preserves a season prefix in the range endpoints", () => {
    expect(collapseToRanges(["S06E04", "S06E05", "S06E06"])).toEqual(["S06E04–S06E06"]);
  });
});
