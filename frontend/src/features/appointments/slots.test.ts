import { describe, expect, it } from "vitest";
import { addOneHour, dayRange, instantOn, rangeProblem, todayLocal } from "./slots";

describe("slots", () => {
  it("adds one hour to a time", () => {
    expect(addOneHour("09:00")).toBe("10:00");
    expect(addOneHour("17:30")).toBe("18:30");
  });

  it("builds a local day range from midnight to midnight", () => {
    const { from, to } = dayRange("2026-03-02");
    expect(from.getHours()).toBe(0);
    expect(to.getTime() - from.getTime()).toBe(
      24 * 60 * 60 * 1000 - (to.getTimezoneOffset() - from.getTimezoneOffset()) * 60000,
    );
  });

  it("refuses a range that does not end after it starts", () => {
    const day = "2026-03-02";
    expect(rangeProblem(day, instantOn(day, "11:00"), instantOn(day, "10:00"))).toBe(
      "END_BEFORE_START",
    );
    expect(rangeProblem(day, instantOn(day, "10:00"), instantOn(day, "10:00"))).toBe(
      "END_BEFORE_START",
    );
  });

  it("refuses a range that leaves the chosen day", () => {
    const day = "2026-03-02";
    const nextDay = "2026-03-03";
    expect(rangeProblem(day, instantOn(day, "23:00"), instantOn(nextDay, "01:00"))).toBe(
      "OTHER_DAY",
    );
  });

  it("accepts a range inside the chosen day", () => {
    const day = "2026-03-02";
    expect(rangeProblem(day, instantOn(day, "10:00"), instantOn(day, "11:00"))).toBeNull();
  });

  it("formats the local date as YYYY-MM-DD", () => {
    expect(todayLocal(new Date(2026, 2, 2, 23, 59))).toBe("2026-03-02");
  });
});
