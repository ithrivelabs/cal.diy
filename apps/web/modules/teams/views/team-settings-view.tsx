"use client";

import Link from "next/link";
import { useEffect } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { Label, TextArea, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

type TeamSettingsViewProps = {
  teamSlug: string;
};

export const TeamSettingsView = ({ teamSlug }: TeamSettingsViewProps) => {
  const router = useRouter();
  const { t } = useLocale();
  const teamQuery = trpc.viewer.teams.getBySlug.useQuery({ teamSlug });

  const formSchema = z.object({
    name: z.string().trim().min(1).max(64),
    slug: z.string().trim().min(2).max(64),
    bio: z.string().trim().max(500).optional(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      bio: "",
    },
  });

  useEffect(() => {
    if (teamQuery.data?.team) {
      form.reset({
        name: teamQuery.data.team.name || "",
        slug: teamQuery.data.team.slug || "",
        bio: teamQuery.data.team.bio || "",
      });
    }
  }, [form, teamQuery.data?.team]);

  const updateMutation = trpc.viewer.teams.update.useMutation({
    onSuccess: (updatedTeam) => {
      showToast(t("saved"), "success");
      if (updatedTeam.slug && updatedTeam.slug !== teamSlug) {
        router.push(`/teams/${updatedTeam.slug}/settings`);
      }
    },
    onError: (error) => showToast(error.message, "error"),
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!teamQuery.data?.team.id) return;

    await updateMutation.mutateAsync({
      teamId: teamQuery.data.team.id,
      name: values.name,
      slug: values.slug,
      bio: values.bio || null,
    });
  });

  if (teamQuery.isPending) return null;
  if (teamQuery.isError || !teamQuery.data) {
    return <div className="mx-auto max-w-4xl p-6 text-red-600 text-sm">{teamQuery.error?.message}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("settings")}</h1>
        <div className="flex gap-2">
          <Link href={`/teams/${teamSlug}/members`}>
            <Button color="secondary">{t("team_members")}</Button>
          </Link>
          <Link href={`/event-types?teamId=${teamQuery.data.team.id}`}>
            <Button color="primary">{t("event_types")}</Button>
          </Link>
        </div>
      </div>

      <form className="space-y-4 rounded-xl border border-subtle bg-default p-4" onSubmit={handleSubmit}>
        <TextField label={t("team_name")} {...form.register("name")} />
        <TextField label={t("url")} {...form.register("slug")} />
        <div className="flex w-full flex-col gap-1.5">
          <Label className="text-emphasis mb-0 text-sm font-medium leading-4">{t("team_bio")}</Label>
          <TextArea {...form.register("bio")} className="min-h-[108px] max-h-[150px]" />
        </div>
        <Button type="submit" color="primary" loading={updateMutation.isPending}>
          {t("save")}
        </Button>
      </form>
    </div>
  );
};
