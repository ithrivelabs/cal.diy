"use client";

import Link from "next/link";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { SkeletonText } from "@calcom/ui/components/skeleton";

export const TeamHubView = () => {
  const { t } = useLocale();
  const teamsQuery = trpc.viewer.teams.listMine.useQuery();

  if (teamsQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <SkeletonText className="h-10 w-full" />
        <SkeletonText className="h-10 w-full" />
      </div>
    );
  }

  if (teamsQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-4xl p-6">
        <p className="text-sm text-red-600">{teamsQuery.error.message}</p>
      </div>
    );
  }

  const teams = teamsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("teams")}</h1>
        <Link href="/onboarding/teams/details">
          <Button color="primary" StartIcon="plus">
            {t("create_team")}
          </Button>
        </Link>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-xl border border-subtle bg-default p-6">
          <p className="text-sm text-subtle">{t("create_team_to_get_started")}</p>
        </div>
      ) : (
        teams.map(({ team, role }) => (
          <div key={team.id} className="flex items-center justify-between rounded-xl border border-subtle bg-default p-4">
            <div>
              <p className="font-semibold text-emphasis">{team.name}</p>
              <p className="text-sm text-subtle">{team.bio || team.slug}</p>
              <p className="text-xs text-subtle">{role}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/teams/${team.slug}/members`}>
                <Button color="secondary">{t("team_members")}</Button>
              </Link>
              <Link href={`/teams/${team.slug}/settings`}>
                <Button color="secondary">{t("settings")}</Button>
              </Link>
              <Link href={`/event-types?teamId=${team.id}`}>
                <Button color="primary">{t("events")}</Button>
              </Link>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
