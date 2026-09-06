import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  dueAlerts,
  meetFor,
  movementsToday,
  originOf,
  pickupFor,
  statusOf,
  suggestPickup,
} from "../rules";
import { BLANK, type MovementRecord } from "../types";

/** A record with everything blank except the fields a test cares about. */
function rec(overrides: Partial<MovementRecord> = {}): MovementRecord {
  return { ...BLANK, id: "r1", no: 1, ...overrides } as MovementRecord;
}

describe("originOf", () => {
  it("takes the place the passenger is leaving from", () => {
    expect(originOf("Divan Hotel to EIA")).toBe("Divan Hotel");
    expect(originOf("EIA to Ramada Hotel")).toBe("EIA");
    expect(originOf("")).toBe("");
  });
});

describe("suggestPickup", () => {
  it("subtracts check-in, drive and buffer from the flight time", () => {
    // Erbil check-in 120 + Ramada drive 25 + buffer 15 = 160 minutes.
    const s = suggestPickup(
      rec({ depDate: "2026-09-10", depTime: "16:50", depAirport: "Erbil (EIA)", depDest: "Ramada Hotel to EIA" }),
      DEFAULT_RULES,
    );
    expect(s).not.toBeNull();
    expect(s!.lead).toBe(160);
    expect(s!.time).toBe("14:10");
    expect(s!.dayOffset).toBe(0);
  });

  it("gives CIP passengers an extra hour in bed", () => {
    const s = suggestPickup(
      rec({ depDate: "2026-09-10", depTime: "16:50", depAirport: "Erbil (EIA)", depDest: "Ramada Hotel to EIA", service: "CIP" }),
      DEFAULT_RULES,
    );
    expect(s!.lead).toBe(100); // 120 + 25 - 60 + 15
    expect(s!.time).toBe("15:10");
  });

  it("starts Meet & Greet earlier, because the bus costs time", () => {
    const s = suggestPickup(
      rec({ depDate: "2026-09-10", depTime: "16:50", depAirport: "Erbil (EIA)", depDest: "Ramada Hotel to EIA", service: "Meet & Greet" }),
      DEFAULT_RULES,
    );
    expect(s!.lead).toBe(175); // 120 + 25 + 15 + 15
    expect(s!.time).toBe("13:55");
  });

  it("allows seven hours for Mardin, including the border", () => {
    const s = suggestPickup(
      rec({ depDate: "2026-09-10", depTime: "12:00", depAirport: "Mardin", depDest: "Ramada Hotel to EIA" }),
      DEFAULT_RULES,
    );
    expect(s!.checkIn).toBe(420);
    expect(s!.lead).toBe(460); // 420 + 25 + 15
    expect(s!.time).toBe("04:20");
  });

  it("rolls back to the night before when the sum crosses midnight", () => {
    // 04:00 flight from Duhok: 120 + 150 + 15 = 285 minutes before.
    const s = suggestPickup(
      rec({ depDate: "2026-09-10", depTime: "04:00", depAirport: "Erbil (EIA)", depDest: "Duhok to EIA" }),
      DEFAULT_RULES,
    );
    expect(s!.time).toBe("23:15");
    expect(s!.dayOffset).toBe(-1);
  });

  it("falls back to the default drive time for an unknown location", () => {
    const s = suggestPickup(
      rec({ depDate: "2026-09-10", depTime: "12:00", depAirport: "Erbil (EIA)", depDest: "Somewhere New to EIA" }),
      DEFAULT_RULES,
    );
    expect(s!.drive).toBe(DEFAULT_RULES.driveDefault);
  });

  it("never goes below the minimum lead, however generous the service", () => {
    const generous = { ...DEFAULT_RULES, checkIn: { "Erbil (EIA)": 30 }, service: { CIP: -200 } };
    const s = suggestPickup(
      rec({ depDate: "2026-09-10", depTime: "12:00", depAirport: "Erbil (EIA)", depDest: "Rotana to EIA", service: "CIP" }),
      generous,
    );
    expect(s!.lead).toBe(generous.minLead);
  });

  it("returns nothing without a departure time or date", () => {
    expect(suggestPickup(rec({ depDate: "2026-09-10", depTime: "" }), DEFAULT_RULES)).toBeNull();
    expect(suggestPickup(rec({ depDate: "", depTime: "12:00" }), DEFAULT_RULES)).toBeNull();
  });
});

describe("meetFor", () => {
  it("puts the driver at the airport before the plane lands", () => {
    const m = meetFor(rec({ arrDate: "2026-09-10", arrTime: "15:50" }), DEFAULT_RULES);
    expect(m!.time).toBe("15:35");
    expect(m!.dayOffset).toBe(0);
  });

  it("rolls back past midnight for an early landing", () => {
    const m = meetFor(rec({ arrDate: "2026-09-10", arrTime: "00:10" }), DEFAULT_RULES);
    expect(m!.time).toBe("23:55");
    expect(m!.dayOffset).toBe(-1);
  });
});

describe("pickupFor", () => {
  it("prefers a manually agreed time over the calculation", () => {
    const p = pickupFor(
      rec({ depDate: "2026-09-10", depTime: "16:50", depDest: "Ramada Hotel to EIA", depPickup: "13:00" }),
      DEFAULT_RULES,
    );
    expect(p!.time).toBe("13:00");
    expect(p!.manual).toBe(true);
    expect(p!.date).toBe("2026-09-10");
  });

  it("reads a manual time later than the flight as the night before", () => {
    const p = pickupFor(
      rec({ depDate: "2026-09-10", depTime: "04:00", depDest: "Ramada Hotel to EIA", depPickup: "23:00" }),
      DEFAULT_RULES,
    );
    expect(p!.dayOffset).toBe(-1);
    expect(p!.date).toBe("2026-09-09");
  });

  it("reports whether the time was agreed with the passenger", () => {
    const base = { depDate: "2026-09-10", depTime: "16:50", depDest: "Ramada Hotel to EIA" };
    expect(pickupFor(rec(base), DEFAULT_RULES)!.confirmed).toBe(false);
    expect(
      pickupFor(rec({ ...base, depPickupConfirmed: { at: "2026-09-01", by: "Zana" } }), DEFAULT_RULES)!.confirmed,
    ).toBe(true);
  });
});

describe("statusOf", () => {
  const today = "2026-09-10";

  it("marks a record with a movement today as today", () => {
    expect(statusOf(rec({ arrDate: today, arrFlight: "TK316" }), today)).toBe("today");
  });

  it("marks both legs ticked off as completed", () => {
    expect(
      statusOf(rec({ arrDate: "2026-09-01", arrDone: true, depDate: "2026-09-20", depDone: true, arrFlight: "TK316" }), today),
    ).toBe("completed");
  });

  it("treats a future booking with no flight number as still open", () => {
    expect(statusOf(rec({ arrDate: "2026-09-20" }), today)).toBe("open");
  });

  it("treats a future booking with a flight as upcoming", () => {
    expect(statusOf(rec({ arrDate: "2026-09-20", arrFlight: "TK316" }), today)).toBe("upcoming");
  });

  it("treats wholly past dates as completed even without the tick", () => {
    expect(statusOf(rec({ arrDate: "2026-09-01", depDate: "2026-09-05", arrFlight: "TK316" }), today)).toBe("completed");
  });

  it("treats a record with no dates at all as open", () => {
    expect(statusOf(rec({ name: "Someone" }), today)).toBe("open");
  });
});

describe("movementsToday", () => {
  const today = "2026-09-10";

  it("lists an arrival and a departure for the same person separately", () => {
    const list = movementsToday(
      [rec({ arrDate: today, arrTime: "09:00", depDate: today, depTime: "16:50", depDest: "Ramada Hotel to EIA" })],
      today,
      DEFAULT_RULES,
    );
    expect(list.map((m) => m.kind)).toEqual(["ARR", "DEP"]);
  });

  it("shows tonight's pickup for tomorrow's early flight, and says so", () => {
    const list = movementsToday(
      [rec({ depDate: "2026-09-11", depTime: "04:00", depDest: "Duhok to EIA" })],
      today,
      DEFAULT_RULES,
    );
    expect(list).toHaveLength(1);
    expect(list[0].pickup).toBe("23:15");
    expect(list[0].flightTomorrow).toBe(true);
  });

  it("flags a flight today whose passenger was collected last night", () => {
    const list = movementsToday(
      [rec({ depDate: today, depTime: "04:00", depDest: "Duhok to EIA" })],
      today,
      DEFAULT_RULES,
    );
    expect(list[0].pickupWasYesterday).toBe(true);
  });

  it("sorts by when the driver has to move, not the flight time", () => {
    const list = movementsToday(
      [
        rec({ id: "late", depDate: today, depTime: "18:00", depDest: "Rotana to EIA" }),
        rec({ id: "early", arrDate: today, arrTime: "07:00" }),
      ],
      today,
      DEFAULT_RULES,
    );
    expect(list.map((m) => m.id)).toEqual(["early", "late"]);
  });
});

describe("dueAlerts", () => {
  const today = "2026-09-10";

  it("raises a reminder shortly before the driver is due", () => {
    const records = [rec({ arrDate: today, arrTime: "10:00", arrDriver: "Ako" })];
    // Meet time is 09:45 (585). At 09:40 the driver is due in 5 minutes.
    const alerts = dueAlerts(records, today, DEFAULT_RULES, 580);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].at).toBe("09:45");
    expect(alerts[0].left).toBe(5);
  });

  it("stays quiet while the moment is still far off", () => {
    const records = [rec({ arrDate: today, arrTime: "10:00" })];
    expect(dueAlerts(records, today, DEFAULT_RULES, 400)).toHaveLength(0);
  });

  it("keeps a missed reminder up for an hour, then drops it", () => {
    const records = [rec({ arrDate: today, arrTime: "10:00" })];
    expect(dueAlerts(records, today, DEFAULT_RULES, 630)).toHaveLength(1); // 45 min late
    expect(dueAlerts(records, today, DEFAULT_RULES, 700)).toHaveLength(0); // 115 min late
  });

  it("says nothing about a leg already done or already reminded", () => {
    expect(dueAlerts([rec({ arrDate: today, arrTime: "10:00", arrDone: true })], today, DEFAULT_RULES, 580)).toHaveLength(0);
    expect(dueAlerts([rec({ arrDate: today, arrTime: "10:00", arrReminded: "x" })], today, DEFAULT_RULES, 580)).toHaveLength(0);
  });

  it("orders the most urgent first", () => {
    const records = [
      rec({ id: "later", arrDate: today, arrTime: "10:00" }),
      rec({ id: "sooner", arrDate: today, arrTime: "09:50" }),
    ];
    const alerts = dueAlerts(records, today, DEFAULT_RULES, 580);
    expect(alerts.map((a) => a.record.id)).toEqual(["sooner", "later"]);
  });
});
