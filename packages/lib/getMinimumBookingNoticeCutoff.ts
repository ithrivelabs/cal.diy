import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { MINUTES_IN_DAY } from "./convertToNewDurationType";

type GetMinimumBookingNoticeCutoffParams = {
  minimumBookingNotice: number;
  timeZone?: string | null;
  utcOffset?: number | null;
  now?: Dayjs;
  originalBookingStartTime?: Date | string | Dayjs | null;
};

const isWholeDayNotice = (minimumBookingNotice: number): boolean =>
  minimumBookingNotice >= MINUTES_IN_DAY && minimumBookingNotice % MINUTES_IN_DAY === 0;

const startOfDayInZone = ({
  value,
  timeZone,
  utcOffset,
}: {
  value: Date | string | Dayjs;
  timeZone?: string | null;
  utcOffset?: number | null;
}): Dayjs => {
  const date = dayjs(value);
  if (timeZone) {
    return date.tz(timeZone).startOf("day");
  }
  if (typeof utcOffset === "number") {
    return date.utcOffset(utcOffset).startOf("day");
  }
  return date.startOf("day");
};

/**
 * Whole-day notices ("3 days") start at midnight of that calendar day, not N*24 hours from now.
 * Hours/minutes notices stay elapsed duration so a 2-hour notice is still 2 hours.
 *
 * Reschedule cannot move to an earlier calendar day than the original booking (that would skip the buffer).
 * Remaining slots on the original day, and later days in the window, stay selectable.
 */
export function getMinimumBookingNoticeCutoff({
  minimumBookingNotice,
  timeZone,
  utcOffset,
  now,
  originalBookingStartTime,
}: GetMinimumBookingNoticeCutoffParams): Dayjs {
  const current = now ?? dayjs();

  if (originalBookingStartTime) {
    const originalDayStart = startOfDayInZone({
      value: originalBookingStartTime,
      timeZone,
      utcOffset,
    });
    if (originalDayStart.isAfter(current)) {
      return originalDayStart;
    }
    return current;
  }

  if (isWholeDayNotice(minimumBookingNotice)) {
    const days = minimumBookingNotice / MINUTES_IN_DAY;
    if (timeZone) {
      return current.tz(timeZone).startOf("day").add(days, "day");
    }
    if (typeof utcOffset === "number") {
      return current.utcOffset(utcOffset).startOf("day").add(days, "day");
    }
    return current.startOf("day").add(days, "day");
  }

  return current.add(minimumBookingNotice, "minute");
}
