"use client";

import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { MembershipRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { showToast } from "@calcom/ui/components/toast";
import { useEffect, useMemo, useState } from "react";
import { AdminUserAvailabilityDialog } from "./admin-user-availability-dialog";

const canEditByRole = (role?: MembershipRole) =>
  role === MembershipRole.ADMIN || role === MembershipRole.OWNER;

type DateInput = string | number | Date;

const formatRange = (range: { start: unknown; end: unknown }) => {
  const start = dayjs(range.start as DateInput);
  const end = dayjs(range.end as DateInput);
  if (!start.isValid() || !end.isValid()) return null;
  return `${start.format("ddd, MMM D HH:mm")} - ${end.format("HH:mm")}`;
};

export const AdminTeamAvailabilityView = () => {
  const { t } = useLocale();
  const utils = trpc.useUtils();

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [searchString, setSearchString] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [startDate, setStartDate] = useState(dayjs().startOf("day").format("YYYY-MM-DD"));
  const [endDate, setEndDate] = useState(dayjs().add(7, "day").endOf("day").format("YYYY-MM-DD"));
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserLabel, setSelectedUserLabel] = useState("");
  const [isAvailabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);

  const listMineQuery = trpc.viewer.teams.listMine.useQuery();
  const meQuery = trpc.viewer.me.get.useQuery();

  useEffect(() => {
    if (!selectedTeamId && listMineQuery.data?.length) {
      setSelectedTeamId(listMineQuery.data[0].team.id);
    }
  }, [selectedTeamId, listMineQuery.data]);

  const selectedTeamMembership = useMemo(
    () => listMineQuery.data?.find((item) => item.team.id === selectedTeamId),
    [listMineQuery.data, selectedTeamId]
  );

  const canEdit = canEditByRole(selectedTeamMembership?.role);

  const availabilityQuery = trpc.viewer.availability.listTeam.useQuery(
    {
      limit: 100,
      cursor: null,
      teamId: selectedTeamId ?? undefined,
      startDate: dayjs(startDate).startOf("day").toISOString(),
      endDate: dayjs(endDate).endOf("day").toISOString(),
      loggedInUsersTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(searchString.trim() ? { searchString } : {}),
    },
    {
      enabled: typeof selectedTeamId === "number",
    }
  );

  const membersQuery = trpc.viewer.teams.listMembers.useQuery(
    { teamId: selectedTeamId ?? 0 },
    { enabled: typeof selectedTeamId === "number" }
  );

  const inviteMutation = trpc.viewer.teams.inviteMembers.useMutation({
    onSuccess: async () => {
      setInviteEmail("");
      await Promise.all([
        membersQuery.refetch(),
        availabilityQuery.refetch(),
        utils.viewer.teams.listMine.invalidate(),
      ]);
      showToast(t("invitation_resent"), "success");
    },
    onError: (error) => showToast(error.message, "error"),
  });

  const roleMutation = trpc.viewer.teams.updateMemberRole.useMutation({
    onSuccess: async () => {
      await Promise.all([
        membersQuery.refetch(),
        availabilityQuery.refetch(),
        utils.viewer.teams.listMine.invalidate(),
      ]);
      showToast(t("saved"), "success");
    },
    onError: (error) => showToast(error.message, "error"),
  });

  const removeMutation = trpc.viewer.teams.removeMember.useMutation({
    onSuccess: async () => {
      await Promise.all([membersQuery.refetch(), availabilityQuery.refetch()]);
      showToast(t("saved"), "success");
    },
    onError: (error) => showToast(error.message, "error"),
  });

  if (listMineQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <SkeletonText className="h-10 w-full" />
        <SkeletonText className="h-10 w-full" />
      </div>
    );
  }

  if (listMineQuery.isError) {
    return <div className="mx-auto max-w-5xl p-6 text-red-600 text-sm">{listMineQuery.error.message}</div>;
  }

  const teams = listMineQuery.data ?? [];
  if (teams.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="rounded-xl border border-subtle bg-default p-6 text-sm text-subtle">{t("no_teams")}</div>
      </div>
    );
  }

  const membersByUserId = new Map((membersQuery.data ?? []).map((member) => [member.userId, member]));
  const rows = availabilityQuery.data?.rows ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("admin")}</h1>
      </div>

      <div className="rounded-xl border border-subtle bg-default p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-subtle">{t("Teams")}</span>
            <select
              className="h-10 rounded-md border border-subtle bg-default px-3 text-sm"
              value={selectedTeamId ?? ""}
              onChange={(event) => setSelectedTeamId(Number(event.target.value))}>
              {teams.map(({ team }) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-subtle">{t("Start date")}</span>
            <input
              type="date"
              className="h-10 rounded-md border border-subtle bg-default px-3 text-sm"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-subtle">{t("End date")}</span>
            <input
              type="date"
              className="h-10 rounded-md border border-subtle bg-default px-3 text-sm"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>

          <div>
            <span className="text-sm text-subtle">{t("Search")}</span>
            <TextField
              label={t("search")}
              value={searchString}
              className="h-10"
              onChange={(event) => setSearchString(event.target.value)}
              placeholder={t("search")}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-subtle bg-default p-4">
        <p className="mb-2 font-medium text-emphasis">{t("team_members")}</p>
        <p className="mb-3 text-xs text-subtle">
          {canEdit ? "You can edit roles and memberships for this team." : "View-only mode. Admins/owners can edit."}
        </p>
        <div className="flex gap-2">
          <TextField
            labelSrOnly
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="member@example.com"
            disabled={!canEdit}
          />
          <select
            className="rounded-md border border-subtle bg-default px-3 text-sm"
            value={inviteRole}
            disabled={!canEdit}
            onChange={(event) => setInviteRole(event.target.value as "ADMIN" | "MEMBER")}>
            <option value={MembershipRole.MEMBER}>{MembershipRole.MEMBER}</option>
            <option value={MembershipRole.ADMIN}>{MembershipRole.ADMIN}</option>
          </select>
          <Button
            color="primary"
            disabled={!canEdit || !inviteEmail || inviteMutation.isPending || !selectedTeamId}
            loading={inviteMutation.isPending}
            onClick={() =>
              selectedTeamId &&
              inviteMutation.mutate({
                teamId: selectedTeamId,
                invites: [{ email: inviteEmail, role: inviteRole }],
              })
            }>
            {t("invite")}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-subtle bg-default">
        {availabilityQuery.isPending && <div className="p-4 text-sm text-subtle">{t("loading")}</div>}
        {availabilityQuery.isError && (
          <div className="p-4 text-red-600 text-sm">{availabilityQuery.error.message}</div>
        )}
        {!availabilityQuery.isPending && !availabilityQuery.isError && rows.length === 0 && (
          <div className="p-4 text-sm text-subtle">No users found for the selected filters.</div>
        )}

        {rows.map((row) => {
          const member = membersByUserId.get(row.id);
          const isCurrentUser = row.id === meQuery.data?.id;
          const canManageThisMember =
            canEdit && member?.accepted && member.role !== MembershipRole.OWNER && !isCurrentUser;
          const ranges = row.dateRanges
            .slice(0, 3)
            .map((range) => formatRange(range))
            .filter((value): value is string => Boolean(value));

          return (
            <div key={row.id} className="border-subtle border-b p-4 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-emphasis">{row.name || row.email}</p>
                  <p className="text-xs text-subtle">
                    {row.email} - {member?.role ?? row.role} - {row.timeZone}
                  </p>
                  {row.defaultScheduleId === -1 ? (
                    <p className="mt-1 text-xs text-subtle">No default schedule configured.</p>
                  ) : ranges.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-subtle">
                      {ranges.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-subtle">No availability windows in selected range.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    color="secondary"
                    onClick={() => {
                      setSelectedUserId(row.id);
                      setSelectedUserLabel(row.name || row.email);
                      setAvailabilityDialogOpen(true);
                    }}>
                    Manage availability
                  </Button>
                  {canManageThisMember && member && (
                    <>
                      <Button
                        color="secondary"
                        disabled={roleMutation.isPending}
                        onClick={() =>
                          selectedTeamId &&
                          roleMutation.mutate({
                            teamId: selectedTeamId,
                            userId: row.id,
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
                          selectedTeamId &&
                          removeMutation.mutate({
                            teamId: selectedTeamId,
                            userId: row.id,
                          })
                        }>
                        {t("remove")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <AdminUserAvailabilityDialog
        open={isAvailabilityDialogOpen}
        onOpenChange={setAvailabilityDialogOpen}
        userId={selectedUserId}
        userLabel={selectedUserLabel}
        canEdit={canEdit}
      />
    </div>
  );
};
