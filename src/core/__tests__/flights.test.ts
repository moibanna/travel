import { describe, expect, it } from "vitest";
import { flightNumbers, sameFlight, splitFlights } from "../flights";

describe("flightNumbers", () => {
  it("carries the airline code onto a bare second number", () => {
    expect(flightNumbers("TK316/805")).toEqual(["TK316", "TK 805"]);
  });

  it("leaves an explicit second carrier alone", () => {
    expect(flightNumbers("RJ 824/TK317")).toEqual(["RJ 824", "TK317"]);
  });

  it("keeps both codes when each leg states one", () => {
    expect(flightNumbers("G 9357 / G 9358")).toEqual(["G 9357", "G 9358"]);
  });

  it("handles a stray space after the separator", () => {
    expect(flightNumbers("QR451/ 450")).toEqual(["QR451", "QR 450"]);
  });

  it("reads a full airline name as the code", () => {
    expect(flightNumbers("Flydubai 209/204")).toEqual([
      "FLYDUBAI 209",
      "FLYDUBAI 204",
    ]);
  });

  it("accepts the other separators the desk uses", () => {
    expect(flightNumbers("TK316, 805")).toEqual(["TK316", "TK 805"]);
    expect(flightNumbers("TK316 + 805")).toEqual(["TK316", "TK 805"]);
  });

  it("returns nothing for blanks", () => {
    expect(flightNumbers("")).toEqual([]);
    expect(flightNumbers(null)).toEqual([]);
    expect(flightNumbers("   ")).toEqual([]);
  });
});

describe("splitFlights", () => {
  it("assigns first to arrival and last to departure", () => {
    expect(splitFlights("TK804/317", true, true)).toEqual({
      arr: "TK804",
      dep: "TK 317",
    });
  });

  it("puts a lone number on whichever leg exists", () => {
    expect(splitFlights("EK 270", true, false)).toEqual({ arr: "EK 270", dep: "" });
    expect(splitFlights("EK 270", false, true)).toEqual({ arr: "", dep: "EK 270" });
  });

  it("refuses to guess a second flight when both legs exist", () => {
    // A wrong departure flight number is worse than an empty one.
    expect(splitFlights("EK 270", true, true)).toEqual({ arr: "EK 270", dep: "" });
  });

  it("uses the outermost numbers when more than two are written", () => {
    expect(splitFlights("TK316/TK805/TK900", true, true)).toEqual({
      arr: "TK316",
      dep: "TK900",
    });
  });
});

describe("sameFlight", () => {
  it("ignores spacing and case", () => {
    expect(sameFlight("TK 316", "tk316")).toBe(true);
  });

  it("treats blanks as not matching", () => {
    expect(sameFlight("", "")).toBe(false);
    expect(sameFlight("TK316", "")).toBe(false);
  });
});
