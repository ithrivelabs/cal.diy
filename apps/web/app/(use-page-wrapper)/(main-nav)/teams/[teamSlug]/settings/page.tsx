import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";

import { TeamSettingsView } from "~/teams/views/team-settings-view";

const TeamSettingsPage = async ({ params }: { params: Promise<{ teamSlug: string }> }) => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) {
    return redirect("/auth/login");
  }

  const { teamSlug } = await params;
  return <TeamSettingsView teamSlug={teamSlug} />;
};

export default TeamSettingsPage;
