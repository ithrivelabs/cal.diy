import type { PrismaClient } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { PermissionCheckService } from "./PermissionCheckService";

describe("PermissionCheckService", () => {
  it("returns true when accepted membership has fallback role", async () => {
    const prisma = {
      membership: {
        findUnique: vi.fn().mockResolvedValue({
          accepted: true,
          role: MembershipRole.ADMIN,
        }),
      },
    } as unknown as PrismaClient;

    const service = new PermissionCheckService(prisma);
    const hasPermission = await service.checkPermission({
      userId: 1,
      teamId: 10,
      fallbackRoles: [MembershipRole.ADMIN],
    });

    expect(hasPermission).toBe(true);
  });

  it("returns false when membership is missing", async () => {
    const prisma = {
      membership: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const service = new PermissionCheckService(prisma);
    const hasPermission = await service.checkPermission({
      userId: 1,
      teamId: 10,
      fallbackRoles: [MembershipRole.ADMIN],
    });

    expect(hasPermission).toBe(false);
  });

  it("returns filtered team ids for allowed roles", async () => {
    const prisma = {
      membership: {
        findMany: vi.fn().mockResolvedValue([{ teamId: 1 }, { teamId: 3 }]),
      },
    } as unknown as PrismaClient;

    const service = new PermissionCheckService(prisma);
    const teamIds = await service.getTeamIdsWithPermission({
      userId: 1,
      fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
    });

    expect(teamIds).toEqual([1, 3]);
  });
});
