"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { localStorage } from "@calcom/lib/webstorage";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { EmailInviteForm } from "../../components/EmailInviteForm";
import { OnboardingCard } from "../../components/OnboardingCard";
import { OnboardingLayout } from "../../components/OnboardingLayout";
import { OnboardingInviteBrowserView } from "../../components/onboarding-invite-browser-view";
import { useOnboardingStore } from "../../store/onboarding-store";

type TeamInviteViewProps = {
  userEmail: string;
};

const inviteSchema = z.object({
  invites: z.array(
    z.object({
      email: z.string().trim(),
      role: z.enum(["MEMBER", "ADMIN"]),
    })
  ),
});

const ONBOARDING_REDIRECT_KEY = "onBoardingRedirect";

export const TeamInviteView = ({ userEmail }: TeamInviteViewProps) => {
  const router = useRouter();
  const { t } = useLocale();
  const { teamDetails, teamInvites, setTeamInvites, teamId } = useOnboardingStore();

  useEffect(() => {
    if (!teamId) {
      router.replace("/onboarding/teams/details");
    }
  }, [router, teamId]);

  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      invites: teamInvites.length > 0 ? teamInvites : [{ email: "", role: "MEMBER" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "invites",
  });

  const inviteMutation = trpc.viewer.teams.inviteMembers.useMutation({
    onError: (error) => showToast(error.message, "error"),
  });

  const saveAndContinue = async (skip = false) => {
    const values = form.getValues();
    const normalizedInvites = values.invites
      .map((invite) => ({ ...invite, email: invite.email.trim().toLowerCase() }))
      .filter((invite) => invite.email.length > 0);

    setTeamInvites(normalizedInvites.map((invite) => ({ ...invite, team: teamDetails.name })));
    if (teamId) {
      localStorage.setItem(ONBOARDING_REDIRECT_KEY, `/event-types?teamId=${teamId}`);
    }

    if (!skip && teamId && normalizedInvites.length > 0) {
      const result = await inviteMutation.mutateAsync({
        teamId,
        invites: normalizedInvites,
      });
      const invitedCount = result.invites.filter((invite) => invite.status === "invited").length;
      if (invitedCount > 0) {
        showToast(t("invitation_resent"), "success");
      }
    }

    router.push("/onboarding/personal/settings?fromTeamOnboarding=true");
  };

  return (
    <OnboardingLayout userEmail={userEmail} currentStep={2} totalSteps={2}>
      <OnboardingCard
        title={t("team_invite")}
        subtitle={t("team_invite_subtitle")}
        footer={
          <div className="flex w-full items-center justify-end gap-4">
            <Button
              color="minimal"
              className="rounded-[10px]"
              onClick={() => router.push("/onboarding/teams/details")}>
              {t("back")}
            </Button>
            <Button
              color="secondary"
              className="rounded-[10px]"
              onClick={() => saveAndContinue(true)}
              disabled={inviteMutation.isPending}>
              {t("skip")}
            </Button>
            <Button
              color="primary"
              className="rounded-[10px]"
              onClick={() => saveAndContinue(false)}
              loading={inviteMutation.isPending}
              disabled={inviteMutation.isPending}>
              {t("continue")}
            </Button>
          </div>
        }>
        <FormProvider {...form}>
          <EmailInviteForm
            fields={fields}
            append={(value) => append(value)}
            remove={remove}
            defaultRole="MEMBER"
            emailPlaceholder="member@example.com"
          />
        </FormProvider>
      </OnboardingCard>
      <OnboardingInviteBrowserView teamName={teamDetails.name} />
    </OnboardingLayout>
  );
};
