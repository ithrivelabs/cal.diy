import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  credential: { updateMany: vi.fn() },
}));
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("@calcom/prisma", () => ({ default: mocks }));
vi.mock("@calcom/prisma/enums", () => ({ AppCategories: {} }));
vi.mock("@calcom/app-store/appStoreMetaData", () => ({ appStoreMetadata: {} }));
vi.mock("@calcom/app-store/_utils/validateAppKeys", () => ({ shouldEnableApp: () => true }));

import seedApps from "./seed-app-store";

describe("deployment app seeding", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("GOOGLE_API_CREDENTIALS", "");
    mocks.app.findUnique.mockResolvedValue({ enabled: true });
  });

  it("rejects database failures instead of reporting successful preparation", async () => {
    mocks.app.create.mockRejectedValue(new Error("sensitive database details"));
    await expect(seedApps()).rejects.toThrow("Unable to seed app: apple-calendar");
  });

  it("rejects malformed Google credentials before database writes", async () => {
    vi.stubEnv("GOOGLE_API_CREDENTIALS", "invalid-secret-value");
    await expect(seedApps()).rejects.toThrow("GOOGLE_API_CREDENTIALS must contain valid");
    expect(mocks.app.create).not.toHaveBeenCalled();
  });

  it("does not swallow a Google app database failure", async () => {
    vi.stubEnv(
      "GOOGLE_API_CREDENTIALS",
      JSON.stringify({
        web: {
          client_id: "test-id",
          client_secret: "test-secret",
          redirect_uris: ["https://example.com/callback"],
        },
      })
    );
    mocks.app.create.mockImplementation(async ({ data }: { data: { slug: string } }) => {
      if (data.slug === "google-calendar") throw new Error("database unavailable");
    });
    await expect(seedApps()).rejects.toThrow("Unable to seed app: google-calendar");
  });

  it("accepts Google Calendar already configured in the database", async () => {
    await expect(seedApps({ requireGoogleCalendar: true })).resolves.toBeUndefined();
    expect(mocks.app.findUnique).toHaveBeenCalledWith({
      where: { slug: "google-calendar" },
      select: { enabled: true },
    });
  });

  it("blocks deployment if Google Calendar is disabled", async () => {
    mocks.app.findUnique.mockResolvedValue({ enabled: false });
    await expect(seedApps({ requireGoogleCalendar: true })).rejects.toThrow(
      "Google Calendar must be configured"
    );
  });
});
