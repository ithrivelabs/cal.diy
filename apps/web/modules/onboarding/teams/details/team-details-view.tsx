"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { Label, TextArea, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

import { OnboardingCard } from "../../components/OnboardingCard";
import { OnboardingContinuationPrompt } from "../../components/onboarding-continuation-prompt";
import { OnboardingLayout } from "../../components/OnboardingLayout";
import { OnboardingBrowserView } from "../../components/onboarding-browser-view";
import { useOnboardingStore } from "../../store/onboarding-store";

type TeamDetailsViewProps = {
  userEmail: string;
};

export const TeamDetailsView = ({ userEmail }: TeamDetailsViewProps) => {
  const router = useRouter();
  const { t } = useLocale();
  const { teamDetails, setTeamDetails, setTeamId } = useOnboardingStore();

  const formSchema = z.object({
    name: z.string().trim().min(1, t("team_name_required")).max(64),
    slug: z
      .string()
      .trim()
      .min(2, t("team_name_required"))
      .max(64)
      .regex(/^[a-zA-Z0-9-]+$/, t("team_name_required")),
    bio: z.string().trim().max(500).optional(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: teamDetails.name || "",
      slug: teamDetails.slug || "",
      bio: teamDetails.bio || "",
    },
    mode: "onChange",
  });

  const createTeamMutation = trpc.viewer.teams.create.useMutation({
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const handleContinue = form.handleSubmit(async (data) => {
    const createdTeam = await createTeamMutation.mutateAsync({
      name: data.name,
      slug: data.slug,
      bio: data.bio || null,
    });

    setTeamId(createdTeam.id);
    setTeamDetails({
      name: createdTeam.name,
      slug: createdTeam.slug || data.slug,
      bio: createdTeam.bio || data.bio || "",
    });

    router.push("/onboarding/teams/invite");
  });

  return (
    <>
      <OnboardingContinuationPrompt />
      <OnboardingLayout userEmail={userEmail} currentStep={1} totalSteps={2}>
        <OnboardingCard
          title={t("team_details")}
          subtitle={t("team_onboarding_details_subtitle")}
          footer={
            <div className="flex w-full items-center justify-end gap-4">
              <Button
                color="minimal"
                className="rounded-[10px]"
                onClick={() => router.push("/onboarding/getting-started")}>
                {t("back")}
              </Button>
              <Button
                type="submit"
                form="team-details-form"
                color="primary"
                className="rounded-[10px]"
                loading={createTeamMutation.isPending}
                disabled={createTeamMutation.isPending || !form.formState.isValid}>
                {t("continue")}
              </Button>
            </div>
          }>
          <FormProvider {...form}>
            <form id="team-details-form" onSubmit={handleContinue} className="flex w-full flex-col gap-6 px-1">
              <TextField
                label={t("team_name")}
                {...form.register("name")}
                placeholder={t("your_team_name")}
                onChange={(event) => {
                  form.register("name").onChange(event);
                  if (!form.getValues("slug")) {
                    form.setValue(
                      "slug",
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9\s-]/g, "")
                        .replace(/\s+/g, "-")
                        .replace(/-+/g, "-")
                        .replace(/^-|-$/g, ""),
                      { shouldValidate: true }
                    );
                  }
                }}
              />
              <TextField label={t("url")} {...form.register("slug")} placeholder="my-team" />
              <div className="flex w-full flex-col gap-1.5">
                <Label className="text-emphasis mb-0 text-sm font-medium leading-4">{t("team_bio")}</Label>
                <TextArea
                  {...form.register("bio")}
                  className="min-h-[108px] max-h-[150px]"
                  placeholder={t("team_bio_placeholder")}
                />
              </div>
            </form>
          </FormProvider>
        </OnboardingCard>
        <OnboardingBrowserView
          name={form.watch("name") || undefined}
          bio={form.watch("bio") || undefined}
          teamSlug={form.watch("slug") || undefined}
        />
      </OnboardingLayout>
    </>
  );
};
