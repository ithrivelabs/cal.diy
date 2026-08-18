import dayjs from "@calcom/dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MINUTES_IN_DAY, MINUTES_IN_HOUR } from "./convertToNewDurationType";
import { getMinimumBookingNoticeCutoff } from "./getMinimumBookingNoticeCutoff";

describe("getMinimumBookingNoticeCutoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(dayjs.tz("2026-08-18T16:00:00", "Asia/Kolkata").toDate());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aligns whole-day notices to midnight of the first bookable calendar day", () => {
    const cutoff = getMinimumBookingNoticeCutoff({
      minimumBookingNotice: 3 * MINUTES_IN_DAY,
      timeZone: "Asia/Kolkata",
    });

    expect(cutoff.format()).toBe("2026-08-21T00:00:00+05:30");
  });

  it("keeps hour notices as elapsed time from now", () => {
    const cutoff = getMinimumBookingNoticeCutoff({
      minimumBookingNotice: 2 * MINUTES_IN_HOUR,
      timeZone: "Asia/Kolkata",
    });

    expect(cutoff.tz("Asia/Kolkata").format()).toBe("2026-08-18T18:00:00+05:30");
  });

  it("does not treat a 0-minute notice as a calendar-day notice", () => {
    const cutoff = getMinimumBookingNoticeCutoff({
      minimumBookingNotice: 0,
      timeZone: "Asia/Kolkata",
    });

    expect(cutoff.tz("Asia/Kolkata").format()).toBe("2026-08-18T16:00:00+05:30");
  });

  it("blocks earlier calendar days than the original booking on reschedule", () => {
    const cutoff = getMinimumBookingNoticeCutoff({
      minimumBookingNotice: 0,
      timeZone: "Asia/Kolkata",
      originalBookingStartTime: dayjs.tz("2026-08-21T15:00:00", "Asia/Kolkata").toDate(),
    });

    expect(cutoff.format()).toBe("2026-08-21T00:00:00+05:30");
  });

  it("keeps remaining slots on the original day when rescheduling later that day", () => {
    vi.setSystemTime(dayjs.tz("2026-08-21T14:00:00", "Asia/Kolkata").toDate());

    const cutoff = getMinimumBookingNoticeCutoff({
      minimumBookingNotice: 3 * MINUTES_IN_DAY,
      timeZone: "Asia/Kolkata",
      originalBookingStartTime: dayjs.tz("2026-08-21T15:00:00", "Asia/Kolkata").toDate(),
    });

    expect(cutoff.tz("Asia/Kolkata").format()).toBe("2026-08-21T14:00:00+05:30");
  });
});
