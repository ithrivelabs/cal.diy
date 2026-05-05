import type { PrismaClient } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";

type PermissionCheckOptions = {
  userId: number;
  teamId: number;
  permission?: string;
  fallbackRoles?: MembershipRole[];
};

type GetTeamIdsWithPermissionOptions = {
  userId: number;
  permission?: string;
  fallbackRoles?: MembershipRole[];
};

export class PermissionCheckService {
  constructor(private prisma: PrismaClient) {}

  async checkPermission(options: PermissionCheckOptions): Promise<boolean> {
    const { userId, teamId, fallbackRoles = [MembershipRole.ADMIN, MembershipRole.OWNER] } = options;

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
      select: {
        accepted: true,
        role: true,
      },
    });

    if (!membership || !membership.accepted) {
      return false;
    }

    return fallbackRoles.includes(membership.role);
  }

  async hasPermission(options: PermissionCheckOptions): Promise<boolean> {
    return this.checkPermission(options);
  }

  async getTeamIdsWithPermission(options: GetTeamIdsWithPermissionOptions): Promise<number[]> {
    const { userId, fallbackRoles = [MembershipRole.ADMIN, MembershipRole.OWNER] } = options;

    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        accepted: true,
        role: {
          in: fallbackRoles,
        },
      },
      select: {
        teamId: true,
      },
    });

    return memberships.map((membership) => membership.teamId);
  }
}
