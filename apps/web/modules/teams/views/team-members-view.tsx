"use client";

import Link from "next/link";
import { useState } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { MembershipRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";

type TeamMembersViewProps = {
  teamSlug: string;
};

export const TeamMembersView = ({ teamSlug }: TeamMembersViewProps) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");

  const teamQuery = trpc.viewer.teams.getBySlug.useQuery({ teamSlug });
  const meQuery = trpc.viewer.me.get.useQuery();
  const teamId = teamQuery.data?.team.id;
  const membersQuery = trpc.viewer.teams.listMembers.useQuery(
    { teamId: teamId ?? 0 },
    { enabled: typeof teamId === "number" }
  );

  const inviteMutation = trpc.viewer.teams.inviteMembers.useMutation({
    onSuccess: async () => {
      setInviteEmail("");
      await membersQuery.refetch();
      showToast(t("invitation_resent"), "success");
    },
    onError: (error) => showToast(error.message, "error"),
  });

  const roleMutation = trpc.viewer.teams.updateMemberRole.useMutation({
    onSuccess: async () => {
      await membersQuery.refetch();
      await utils.viewer.teams.listMine.invalidate();
    },
    onError: (error) => showToast(error.message, "error"),
  });

  const removeMutation = trpc.viewer.teams.removeMember.useMutation({
    onSuccess: async () => {
      await membersQuery.refetch();
    },
    onError: (error) => showToast(error.message, "error"),
  });

  if (teamQuery.isPending) return null;
  if (teamQuery.isError || !teamQuery.data) {
    return <div className="mx-auto max-w-4xl p-6 text-red-600 text-sm">{teamQuery.error?.message}</div>;
  }

  const membershipRole = teamQuery.data.role;
  const canManageMembers = membershipRole === MembershipRole.ADMIN || membershipRole === MembershipRole.OWNER;
  const members = membersQuery.data ?? [];
  if (membersQuery.isError) {
    return <div className="mx-auto max-w-4xl p-6 text-red-600 text-sm">{membersQuery.error.message}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{teamQuery.data.team.name}</h1>
        <div className="flex gap-2">
          <Link href={`/teams/${teamSlug}/settings`}>
            <Button color="secondary">{t("settings")}</Button>
          </Link>
          <Link href={`/event-types?teamId=${teamId}`}>
            <Button color="primary">{t("event_types")}</Button>
          </Link>
        </div>
      </div>

      {canManageMembers && (
        <div className="rounded-xl border border-subtle bg-default p-4">
          <p className="mb-2 font-medium text-emphasis">{t("invite_team_members")}</p>
          <div className="flex gap-2">
            <TextField
              labelSrOnly
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="member@example.com"
            />
            <select
              className="rounded-md border border-subtle bg-default px-3 text-sm"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as "MEMBER" | "ADMIN")}>
              <option value={MembershipRole.MEMBER}>{MembershipRole.MEMBER}</option>
              <option value={MembershipRole.ADMIN}>{MembershipRole.ADMIN}</option>
            </select>
            <Button
              color="primary"
              disabled={!inviteEmail || inviteMutation.isPending}
              loading={inviteMutation.isPending}
              onClick={() =>
                teamId &&
                inviteMutation.mutate({
                  teamId,
                  invites: [{ email: inviteEmail, role: inviteRole }],
                })
              }>
              {t("invite")}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-subtle bg-default">
        {members.map((member) => {
          const isCurrentUser = member.userId === meQuery.data?.id;
          const canResendInvite = canManageMembers && !member.accepted;
          return (
            <div key={member.userId} className="flex items-center justify-between border-b border-subtle p-4 last:border-b-0">
              <div>
                <p className="font-medium text-emphasis">{member.user.name || member.user.email}</p>
                <p className="text-xs text-subtle">
                  {member.user.email} - {member.role} - {member.accepted ? "accepted" : "pending"}
                </p>
              </div>
              <div className="flex gap-2">
                {canResendInvite && (
                  <Button
                    color="secondary"
                    disabled={inviteMutation.isPending || !teamId}
                    loading={inviteMutation.isPending}
                    onClick={() =>
                      teamId &&
                      inviteMutation.mutate({
                        teamId,
                        invites: [
                          {
                            email: member.user.email,
                            role:
                              member.role === MembershipRole.ADMIN
                                ? MembershipRole.ADMIN
                                : MembershipRole.MEMBER,
                          },
                        ],
                      })
                    }>
                    {t("resend_invitation")}
                  </Button>
                )}
                {canManageMembers && member.accepted && member.role !== MembershipRole.OWNER && !isCurrentUser && (
                  <>
                    <Button
                      color="secondary"
                      disabled={roleMutation.isPending}
                      onClick={() =>
                        teamId &&
                        roleMutation.mutate({
                          teamId,
                          userId: member.userId,
                          role:
                            member.role === MembershipRole.ADMIN
                              ? MembershipRole.MEMBER
                              : MembershipRole.ADMIN,
                        })
                      }>
                      {member.role === MembershipRole.ADMIN ? "Make member" : "Make admin"}
                    </Button>
                    <Button
                      color="destructive"
                      disabled={removeMutation.isPending}
                      onClick={() =>
                        teamId &&
                        removeMutation.mutate({
                          teamId,
                          userId: member.userId,
                        })
                      }>
                      {t("remove")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
