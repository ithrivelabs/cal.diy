import { randomBytes } from "node:crypto";
import { addDays } from "date-fns";
import { z } from "zod";

import { sendTeamInviteEmail } from "@calcom/emails/organization-email-service";
import { getTranslation } from "@calcom/i18n/server";
import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import { TRPCError } from "@trpc/server";
import { WEBAPP_URL } from "@calcom/lib/constants";
import slugify from "@calcom/lib/slugify";
import type { PrismaClient } from "@calcom/prisma/client";

const MEMBERSHIP_ROLE = {
  MEMBER: "MEMBER",
  ADMIN: "ADMIN",
  OWNER: "OWNER",
} as const;

const ZCreateTeamInput = z.object({
  name: z.string().trim().min(1).max(64),
  slug: z.string().trim().min(2).max(64).optional(),
  bio: z.string().trim().max(500).optional().nullable(),
});

const ZGetTeamBySlugInput = z.object({
  teamSlug: z.string().trim().min(1),
});

const ZListMembersInput = z.object({
  teamId: z.number().int().positive(),
});

const ZInviteMembersInput = z.object({
  teamId: z.number().int().positive(),
  invites: z
    .array(
      z.object({
        email: z.string().trim().email(),
        role: z.enum([MEMBERSHIP_ROLE.MEMBER, MEMBERSHIP_ROLE.ADMIN]).default(MEMBERSHIP_ROLE.MEMBER),
      })
    )
    .min(1)
    .max(50),
});

const ZUpdateMemberRoleInput = z.object({
  teamId: z.number().int().positive(),
  userId: z.number().int().positive(),
  role: z.enum([MEMBERSHIP_ROLE.MEMBER, MEMBERSHIP_ROLE.ADMIN, MEMBERSHIP_ROLE.OWNER]),
});

const ZRemoveMemberInput = z.object({
  teamId: z.number().int().positive(),
  userId: z.number().int().positive(),
});

const ZUpdateTeamInput = z.object({
  teamId: z.number().int().positive(),
  name: z.string().trim().min(1).max(64).optional(),
  bio: z.string().trim().max(500).optional().nullable(),
  slug: z.string().trim().min(2).max(64).optional(),
});

type AllowedRole = typeof MEMBERSHIP_ROLE.ADMIN | typeof MEMBERSHIP_ROLE.OWNER;

async function requireTeamAdminOrOwner({
  prisma,
  userId,
  teamId,
}: {
  prisma: PrismaClient;
  userId: number;
  teamId: number;
}) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_teamId: {
        userId,
        teamId,
      },
    },
    select: {
      role: true,
      accepted: true,
      team: {
        select: {
          id: true,
          isOrganization: true,
        },
      },
    },
  });

  if (!membership || !membership.accepted) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this team." });
  }

  if (membership.team.isOrganization) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Organization is not supported in this endpoint." });
  }

  if (![MEMBERSHIP_ROLE.ADMIN, MEMBERSHIP_ROLE.OWNER].includes(membership.role as AllowedRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only team admins and owners can perform this action." });
  }

  return membership;
}

async function ensureNonOrgSlugAvailable({
  prisma,
  slug,
  excludeTeamId,
}: {
  prisma: PrismaClient;
  slug: string;
  excludeTeamId?: number;
}) {
  const existing = await prisma.team.findFirst({
    where: {
      slug,
      isOrganization: false,
      ...(excludeTeamId ? { id: { not: excludeTeamId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new TRPCError({ code: "CONFLICT", message: "Team slug is already taken." });
  }
}

export const teamsRouter = router({
  listMine: authedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.membership.findMany({
      where: {
        userId: ctx.user.id,
        accepted: true,
        team: {
          isOrganization: false,
        },
      },
      select: {
        role: true,
        team: {
          select: {
            id: true,
            name: true,
            slug: true,
            bio: true,
          },
        },
      },
      orderBy: {
        team: {
          name: "asc",
        },
      },
    });
  }),

  getBySlug: authedProcedure.input(ZGetTeamBySlugInput).query(async ({ ctx, input }) => {
    const membership = await ctx.prisma.membership.findFirst({
      where: {
        userId: ctx.user.id,
        accepted: true,
        team: {
          slug: input.teamSlug,
          isOrganization: false,
        },
      },
      select: {
        role: true,
        team: {
          select: {
            id: true,
            name: true,
            slug: true,
            bio: true,
          },
        },
      },
    });

    if (!membership) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
    }

    return membership;
  }),

  create: authedProcedure.input(ZCreateTeamInput).mutation(async ({ ctx, input }) => {
    const normalizedSlug = slugify(input.slug || input.name);
    if (!normalizedSlug) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid team slug." });
    }

    await ensureNonOrgSlugAvailable({ prisma: ctx.prisma, slug: normalizedSlug });

    const team = await ctx.prisma.$transaction(async (tx) => {
      const createdTeam = await tx.team.create({
        data: {
          name: input.name,
          slug: normalizedSlug,
          bio: input.bio ?? null,
          isOrganization: false,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          bio: true,
        },
      });

      await tx.membership.create({
        data: {
          teamId: createdTeam.id,
          userId: ctx.user.id,
          accepted: true,
          role: MEMBERSHIP_ROLE.OWNER,
        },
      });

      return createdTeam;
    });

    return team;
  }),

  update: authedProcedure.input(ZUpdateTeamInput).mutation(async ({ ctx, input }) => {
    await requireTeamAdminOrOwner({
      prisma: ctx.prisma,
      userId: ctx.user.id,
      teamId: input.teamId,
    });

    let nextSlug: string | undefined;
    if (input.slug) {
      nextSlug = slugify(input.slug);
      if (!nextSlug) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid team slug." });
      }
      await ensureNonOrgSlugAvailable({
        prisma: ctx.prisma,
        slug: nextSlug,
        excludeTeamId: input.teamId,
      });
    }

    return ctx.prisma.team.update({
      where: {
        id: input.teamId,
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.bio !== undefined ? { bio: input.bio ?? null } : {}),
        ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
      },
    });
  }),

  listMembers: authedProcedure.input(ZListMembersInput).query(async ({ ctx, input }) => {
    await requireTeamAdminOrOwner({
      prisma: ctx.prisma,
      userId: ctx.user.id,
      teamId: input.teamId,
    });

    return ctx.prisma.membership.findMany({
      where: {
        teamId: input.teamId,
      },
      select: {
        userId: true,
        accepted: true,
        role: true,
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ accepted: "asc" }, { createdAt: "asc" }],
    });
  }),

  inviteMembers: authedProcedure.input(ZInviteMembersInput).mutation(async ({ ctx, input }) => {
    await requireTeamAdminOrOwner({
      prisma: ctx.prisma,
      userId: ctx.user.id,
      teamId: input.teamId,
    });

    const inviter = await ctx.prisma.user.findUnique({
      where: {
        id: ctx.user.id,
      },
      select: {
        email: true,
      },
    });
    const team = await ctx.prisma.team.findUnique({
      where: { id: input.teamId },
      select: {
        id: true,
        name: true,
        isOrganization: true,
        parent: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!team || team.isOrganization) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
    }

    const inviteResults = await ctx.prisma.$transaction(async (tx) => {
      const results: Array<{
        email: string;
        status: "invited" | "already_member";
        joinLink: string | null;
      }> = [];

      for (const invite of input.invites) {
        const normalizedEmail = invite.email.toLowerCase().trim();

        const user = await tx.user.upsert({
          where: {
            email: normalizedEmail,
          },
          update: {
            invitedTo: input.teamId,
          },
          create: {
            email: normalizedEmail,
            invitedTo: input.teamId,
          },
          select: {
            id: true,
          },
        });

        const membership = await tx.membership.findUnique({
          where: {
            userId_teamId: {
              userId: user.id,
              teamId: input.teamId,
            },
          },
          select: {
            accepted: true,
          },
        });

        if (membership?.accepted) {
          results.push({
            email: normalizedEmail,
            status: "already_member",
            joinLink: null,
          });
          continue;
        }

        if (!membership) {
          await tx.membership.create({
            data: {
              teamId: input.teamId,
              userId: user.id,
              accepted: false,
              role: invite.role,
            },
          });
        } else {
          await tx.membership.update({
            where: {
              userId_teamId: {
                userId: user.id,
                teamId: input.teamId,
              },
            },
            data: {
              role: invite.role,
              accepted: false,
            },
          });
        }

        const token = randomBytes(24).toString("hex");
        await tx.verificationToken.create({
          data: {
            identifier: normalizedEmail,
            token,
            teamId: input.teamId,
            expires: addDays(new Date(), 7),
          },
        });

        results.push({
          email: normalizedEmail,
          status: "invited",
          joinLink: `${WEBAPP_URL}/signup?token=${token}`,
        });
      }

      return results;
    });

    const translation = await getTranslation(ctx.user.locale ?? "en", "common");
    const invitesToEmail = inviteResults.filter(
      (invite): invite is { email: string; status: "invited"; joinLink: string } =>
        invite.status === "invited" && !!invite.joinLink
    );
    await Promise.allSettled(
      invitesToEmail.map((invite) =>
        sendTeamInviteEmail({
          language: translation,
          from: inviter?.email ?? "Team admin",
          to: invite.email,
          teamName: team.name,
          joinLink: invite.joinLink,
          isCalcomMember: false,
          isAutoJoin: false,
          isOrg: false,
          parentTeamName: team.parent?.name,
          isExistingUserMovedToOrg: false,
          prevLink: null,
          newLink: null,
        })
      )
    );

    return {
      invitedBy: inviter?.email ?? null,
      invites: inviteResults,
    };
  }),

  updateMemberRole: authedProcedure.input(ZUpdateMemberRoleInput).mutation(async ({ ctx, input }) => {
    const actorMembership = await requireTeamAdminOrOwner({
      prisma: ctx.prisma,
      userId: ctx.user.id,
      teamId: input.teamId,
    });

    const targetMembership = await ctx.prisma.membership.findUnique({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId: input.teamId,
        },
      },
      select: {
        userId: true,
        role: true,
        accepted: true,
      },
    });

    if (!targetMembership || !targetMembership.accepted) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
    }

    const isActorOwner = actorMembership.role === MEMBERSHIP_ROLE.OWNER;
    const isTargetOwner = targetMembership.role === MEMBERSHIP_ROLE.OWNER;
    if (isTargetOwner && !isActorOwner) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can change owner role." });
    }

    if (targetMembership.role === MEMBERSHIP_ROLE.OWNER && input.role !== MEMBERSHIP_ROLE.OWNER) {
      const ownerCount = await ctx.prisma.membership.count({
        where: {
          teamId: input.teamId,
          accepted: true,
          role: MEMBERSHIP_ROLE.OWNER,
        },
      });

      if (ownerCount <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A team must have at least one owner." });
      }
    }

    return ctx.prisma.membership.update({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId: input.teamId,
        },
      },
      data: {
        role: input.role,
      },
      select: {
        userId: true,
        role: true,
        accepted: true,
      },
    });
  }),

  removeMember: authedProcedure.input(ZRemoveMemberInput).mutation(async ({ ctx, input }) => {
    const actorMembership = await requireTeamAdminOrOwner({
      prisma: ctx.prisma,
      userId: ctx.user.id,
      teamId: input.teamId,
    });

    const targetMembership = await ctx.prisma.membership.findUnique({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId: input.teamId,
        },
      },
      select: {
        role: true,
        accepted: true,
      },
    });

    if (!targetMembership) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
    }

    if (targetMembership.role === MEMBERSHIP_ROLE.OWNER) {
      if (actorMembership.role !== MEMBERSHIP_ROLE.OWNER) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can remove owners." });
      }

      const ownerCount = await ctx.prisma.membership.count({
        where: {
          teamId: input.teamId,
          accepted: true,
          role: MEMBERSHIP_ROLE.OWNER,
        },
      });

      if (ownerCount <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A team must have at least one owner." });
      }
    }

    await ctx.prisma.membership.delete({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId: input.teamId,
        },
      },
    });

    return {
      success: true,
    };
  }),
});
