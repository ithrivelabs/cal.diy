"use client";

import { AvailabilitySettings } from "@calcom/atoms/availability/AvailabilitySettings";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { DEFAULT_TIMEZONE_IST } from "@calcom/lib/timeZones";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { DialogClose, DialogContent, DialogHeader } from "@calcom/ui/components/dialog";
import { showToast } from "@calcom/ui/components/toast";
import { useEffect, useState } from "react";

type SchedulesResult = RouterOutputs["viewer"]["availability"]["schedule"]["getAllSchedulesByUserId"];
type ScheduleDetails = RouterOutputs["viewer"]["availability"]["schedule"]["get"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number | null;
  userLabel: string;
  canEdit: boolean;
};

export const AdminUserAvailabilityDialog = ({ open, onOpenChange, userId, userLabel, canEdit }: Props) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

  const schedulesQuery = trpc.viewer.availability.schedule.getAllSchedulesByUserId.useQuery(
    { userId: userId ?? 0 },
    {
      enabled: open && typeof userId === "number",
    }
  );

  useEffect(() => {
    if (!open) {
      setSelectedScheduleId(null);
      return;
    }
    setSelectedScheduleId(null);
  }, [userId, open]);

  useEffect(() => {
    if (!selectedScheduleId && schedulesQuery.data?.schedules.length) {
      const defaultSchedule = schedulesQuery.data.schedules.find((item) => item.isDefault);
      setSelectedScheduleId(defaultSchedule?.id ?? schedulesQuery.data.schedules[0].id);
    }
  }, [selectedScheduleId, schedulesQuery.data]);

  const scheduleQuery = trpc.viewer.availability.schedule.get.useQuery(
    {
      scheduleId: selectedScheduleId ?? undefined,
      isManagedEventType: canEdit,
    },
    {
      enabled: open && typeof selectedScheduleId === "number",
    }
  );

  const updateMutation = trpc.viewer.availability.schedule.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        scheduleQuery.refetch(),
        schedulesQuery.refetch(),
        utils.viewer.availability.list.invalidate(),
      ]);
      showToast("Availability updated successfully", "success");
    },
    onError: (error) => showToast(error.message, "error"),
  });

  const deleteMutation = trpc.viewer.availability.schedule.delete.useMutation({
    onSuccess: async () => {
      await schedulesQuery.refetch();
      setSelectedScheduleId(null);
      showToast("Schedule deleted successfully", "success");
    },
    onError: (error) => showToast(error.message, "error"),
  });

  const schedules: SchedulesResult["schedules"] = schedulesQuery.data?.schedules ?? [];
  const schedule: ScheduleDetails | undefined = scheduleQuery.data ?? undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent type="creation" size="xl">
        <div className="relative flex items-start gap-3">
          <div className="min-w-0 flex-1 pe-10">
            <DialogHeader title={`Availability: ${userLabel}`} subtitle="Manage user schedules in-place." />
          </div>
          <DialogClose
            color="minimal"
            variant="icon"
            StartIcon="x"
            className="absolute end-0 top-0 shrink-0 text-subtle hover:text-emphasis"
            aria-label={t("close")}
            dialogCloseProps={{ "aria-label": t("close") }}>
            <span className="sr-only">{t("close")}</span>
          </DialogClose>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {schedules.map((item) => (
              <Button
                key={item.id}
                color={item.id === selectedScheduleId ? "primary" : "secondary"}
                onClick={() => setSelectedScheduleId(item.id)}>
                {item.name}
                {item.isDefault ? " (Default)" : ""}
              </Button>
            ))}
          </div>

          {scheduleQuery.isPending || schedulesQuery.isPending ? (
            <div className="text-sm text-subtle">Loading availability...</div>
          ) : null}

          {scheduleQuery.isError ? (
            <div className="text-red-600 text-sm">{scheduleQuery.error.message}</div>
          ) : null}

          {schedule ? (
            <AvailabilitySettings
              key={`${userId ?? "no-user"}-${selectedScheduleId ?? "no-schedule"}`}
              schedule={schedule}
              travelSchedules={[]}
              isDeleting={deleteMutation.isPending}
              isSaving={updateMutation.isPending}
              isLoading={false}
              isPlatform
              defaultTimeZone={DEFAULT_TIMEZONE_IST}
              enableOverrides
              timeFormat={24}
              weekStart="Sunday"
              backPath={false}
              allowDelete={canEdit}
              allowSetToDefault={canEdit}
              handleDelete={() => {
                if (!canEdit || !selectedScheduleId) return;
                deleteMutation.mutate({ scheduleId: selectedScheduleId });
              }}
              handleSubmit={async ({ dateOverrides, ...values }) => {
                if (!canEdit || !selectedScheduleId) return;
                await updateMutation.mutateAsync({
                  scheduleId: selectedScheduleId,
                  dateOverrides: dateOverrides.flatMap((override) => override.ranges),
                  ...values,
                });
              }}
            />
          ) : null}

          <div className="flex justify-end">
            <DialogClose color="secondary">Close</DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
