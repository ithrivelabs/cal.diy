import process from "node:process";
import dayjs from "@calcom/dayjs";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { Holiday } from "./types";

type HolidayInRange = {
  date: string;
  holiday: Holiday;
};

type HrmsHolidayServiceOptions = {
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
  cacheTtlMs?: number;
};

type HrmsConfig = {
  url: string;
  serviceRoleKey: string;
  table: string;
  dateColumn: string;
  nameColumn: string;
  schema: string;
};

type CacheEntry = {
  expiresAt: number;
  holidays: Promise<HolidayInRange[]>;
};

const DEFAULT_CACHE_TTL_MS: number = 5 * 60 * 1000;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class HrmsHolidayService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetcher: typeof fetch;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: HrmsHolidayServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetcher = options.fetcher ?? fetch;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async getHolidaysInRange(startDate: Date, endDate: Date): Promise<HolidayInRange[]> {
    const config = this.getConfig();
    if (!config) return [];

    const start = dayjs(startDate).utc().format("YYYY-MM-DD");
    const endExclusive = dayjs(endDate).utc().add(1, "day").startOf("day").format("YYYY-MM-DD");
    const cacheKey = `${start}:${endExclusive}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.holidays;
    }

    const holidays = this.fetchHolidays(config, start, endExclusive);
    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, holidays });

    try {
      return await holidays;
    } catch (error) {
      this.cache.delete(cacheKey);
      throw error;
    }
  }

  private getConfig(): HrmsConfig | null {
    const url = this.env.HRMS_SUPABASE_URL;
    const serviceRoleKey = this.env.HRMS_SUPABASE_SERVICE_ROLE_KEY;

    if (!url && !serviceRoleKey) return null;

    if (!url || !serviceRoleKey) {
      throw new ErrorWithCode(
        ErrorCode.InternalServerError,
        "Both HRMS_SUPABASE_URL and HRMS_SUPABASE_SERVICE_ROLE_KEY must be configured"
      );
    }

    const config = {
      url,
      serviceRoleKey,
      table: this.env.HRMS_HOLIDAYS_TABLE ?? "holidays",
      dateColumn: this.env.HRMS_HOLIDAY_DATE_COLUMN ?? "date",
      nameColumn: this.env.HRMS_HOLIDAY_NAME_COLUMN ?? "name",
      schema: this.env.HRMS_SUPABASE_SCHEMA ?? "public",
    };

    for (const identifier of [config.table, config.dateColumn, config.nameColumn, config.schema]) {
      if (!IDENTIFIER_PATTERN.test(identifier)) {
        throw new ErrorWithCode(ErrorCode.InternalServerError, "Invalid HRMS holiday configuration");
      }
    }

    return config;
  }

  private async fetchHolidays(
    config: HrmsConfig,
    start: string,
    endExclusive: string
  ): Promise<HolidayInRange[]> {
    try {
      const endpoint = new URL(`/rest/v1/${config.table}`, config.url);
      endpoint.searchParams.set("select", `${config.dateColumn},${config.nameColumn}`);
      endpoint.searchParams.append(config.dateColumn, `gte.${start}`);
      endpoint.searchParams.append(config.dateColumn, `lt.${endExclusive}`);
      endpoint.searchParams.set("order", `${config.dateColumn}.asc`);

      const response = await this.fetcher(endpoint, {
        headers: {
          Accept: "application/json",
          "Accept-Profile": config.schema,
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
      });

      if (!response.ok) {
        throw new ErrorWithCode(ErrorCode.InternalServerError, "Unable to fetch holidays from HRMS", {
          status: response.status,
        });
      }

      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) {
        throw new ErrorWithCode(ErrorCode.InternalServerError, "HRMS holidays response is invalid");
      }

      return rows.map((row, index) => this.toHoliday(row, index, config));
    } catch (error) {
      if (error instanceof ErrorWithCode) throw error;

      throw new ErrorWithCode(ErrorCode.InternalServerError, "Unable to fetch holidays from HRMS");
    }
  }

  private toHoliday(row: unknown, index: number, config: HrmsConfig): HolidayInRange {
    if (!row || typeof row !== "object") {
      throw new ErrorWithCode(ErrorCode.InternalServerError, "HRMS holiday row is invalid");
    }

    const values = row as Record<string, unknown>;
    const rawDate = values[config.dateColumn];
    const name = values[config.nameColumn];
    let date = "";
    if (typeof rawDate === "string") {
      date = rawDate.slice(0, 10);
    }
    const parsedDate = dayjs.utc(date);

    if (
      !ISO_DATE_PATTERN.test(date) ||
      !parsedDate.isValid() ||
      parsedDate.format("YYYY-MM-DD") !== date ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      throw new ErrorWithCode(ErrorCode.InternalServerError, "HRMS holiday row is invalid");
    }

    return {
      date,
      holiday: {
        id: `hrms:${date}:${index}`,
        name: name.trim(),
        date,
        year: Number(date.slice(0, 4)),
      },
    };
  }
}

let defaultService: HrmsHolidayService | null = null;

function getHrmsHolidayService(): HrmsHolidayService {
  if (!defaultService) {
    defaultService = new HrmsHolidayService();
  }

  return defaultService;
}

export { getHrmsHolidayService, HrmsHolidayService };
