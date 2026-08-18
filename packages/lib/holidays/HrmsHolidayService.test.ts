import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it, vi } from "vitest";
import { HrmsHolidayService } from "./HrmsHolidayService";

const configuredEnv: NodeJS.ProcessEnv = {
  HRMS_SUPABASE_URL: "https://hrms.example.supabase.co",
  HRMS_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  HRMS_SUPABASE_SCHEMA: "company",
  HRMS_HOLIDAYS_TABLE: "company_holidays",
  HRMS_HOLIDAY_DATE_COLUMN: "holiday_date",
  HRMS_HOLIDAY_NAME_COLUMN: "holiday_name",
  HRMS_HOLIDAY_DELETED_COLUMN: "is_deleted",
};

describe("HrmsHolidayService", () => {
  it("does not call Supabase when the integration is not configured", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = new HrmsHolidayService({ env: {} as NodeJS.ProcessEnv, fetcher });

    await expect(service.getHolidaysInRange(new Date("2025-01-01"), new Date("2025-01-31"))).resolves.toEqual(
      []
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches only the requested date range with server-side authentication", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          { holiday_date: "2025-01-26", holiday_name: "Republic Day" },
          { holiday_date: "2025-01-01T00:00:00.000Z", holiday_name: " New Year " },
        ]),
        { status: 200 }
      )
    );
    const service = new HrmsHolidayService({ env: configuredEnv, fetcher });

    const holidays = await service.getHolidaysInRange(
      new Date("2025-01-01T10:00:00.000Z"),
      new Date("2025-01-31T18:00:00.000Z")
    );

    expect(holidays).toEqual([
      {
        date: "2025-01-26",
        holiday: {
          id: "hrms:2025-01-26:0",
          name: "Republic Day",
          date: "2025-01-26",
          year: 2025,
        },
      },
      {
        date: "2025-01-01",
        holiday: {
          id: "hrms:2025-01-01:1",
          name: "New Year",
          date: "2025-01-01",
          year: 2025,
        },
      },
    ]);

    const [requestUrl, requestInit] = fetcher.mock.calls[0];
    const url = new URL(requestUrl.toString());
    expect(url.pathname).toBe("/rest/v1/company_holidays");
    expect(url.searchParams.get("select")).toBe("holiday_date,holiday_name");
    expect(url.searchParams.getAll("holiday_date")).toEqual(["gte.2025-01-01", "lt.2025-02-01"]);
    expect(url.searchParams.get("is_deleted")).toBe("eq.false");
    expect(requestInit?.headers).toMatchObject({
      "Accept-Profile": "company",
      apikey: "test-service-role-key",
      Authorization: "Bearer test-service-role-key",
    });
  });

  it("rejects partial configuration", async () => {
    const service = new HrmsHolidayService({
      env: { HRMS_SUPABASE_URL: configuredEnv.HRMS_SUPABASE_URL } as NodeJS.ProcessEnv,
    });

    await expect(
      service.getHolidaysInRange(new Date("2025-01-01"), new Date("2025-01-31"))
    ).rejects.toMatchObject<Partial<ErrorWithCode>>({ code: ErrorCode.InternalServerError });
  });

  it("does not cache a failed Supabase request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    const service = new HrmsHolidayService({ env: configuredEnv, fetcher });
    const start = new Date("2025-01-01");
    const end = new Date("2025-01-31");

    await expect(service.getHolidaysInRange(start, end)).rejects.toBeInstanceOf(ErrorWithCode);
    await expect(service.getHolidaysInRange(start, end)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refetches after a successful response so newly added holidays are visible immediately", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ holiday_date: "2026-08-21", holiday_name: "Testing" }]), {
          status: 200,
        })
      );
    const service = new HrmsHolidayService({ env: configuredEnv, fetcher });
    const start = new Date("2026-08-01");
    const end = new Date("2026-08-31");

    await expect(service.getHolidaysInRange(start, end)).resolves.toEqual([]);
    await expect(service.getHolidaysInRange(start, end)).resolves.toEqual([
      {
        date: "2026-08-21",
        holiday: {
          id: "hrms:2026-08-21:0",
          name: "Testing",
          date: "2026-08-21",
          year: 2026,
        },
      },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares an in-flight request across concurrent callers", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        })
    );
    const service = new HrmsHolidayService({ env: configuredEnv, fetcher });
    const start = new Date("2026-08-01");
    const end = new Date("2026-08-31");

    const first = service.getHolidaysInRange(start, end);
    const second = service.getHolidaysInRange(start, end);
    resolveResponse?.(new Response("[]", { status: 200 }));

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ignores soft-deleted holidays even when HRMS_HOLIDAY_DELETED_COLUMN is unset", async () => {
    const envWithoutDeletedColumn = { ...configuredEnv };
    delete envWithoutDeletedColumn.HRMS_HOLIDAY_DELETED_COLUMN;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("[]", { status: 200 }));
    const service = new HrmsHolidayService({ env: envWithoutDeletedColumn, fetcher });

    await service.getHolidaysInRange(new Date("2026-08-01"), new Date("2026-08-31"));

    const url = new URL(fetcher.mock.calls[0][0].toString());
    expect(url.searchParams.get("is_deleted")).toBe("eq.false");
  });
});
