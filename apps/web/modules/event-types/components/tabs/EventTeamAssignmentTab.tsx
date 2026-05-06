import type { EventTypeSetupProps, FormValues, Host } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SchedulingType } from "@calcom/prisma/enums";
import classNames from "@calcom/ui/classNames";
import { CheckboxField, Label } from "@calcom/ui/components/form";
import type { TeamMembers } from "@calcom/web/modules/event-types/components/EventType";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import CheckedUserSelect from "../CheckedUserSelect";

type EventTeamAssignmentTabProps = {
  eventType: EventTypeSetupProps["eventType"];
  teamMembers: TeamMembers;
};

const assignmentOptions = [
  {
    value: SchedulingType.COLLECTIVE,
    labelKey: "collective",
    descriptionKey: "collective_description",
  },
  {
    value: SchedulingType.ROUND_ROBIN,
    labelKey: "round_robin",
    descriptionKey: "round_robin_description",
  },
] as const;

const EventTeamAssignmentTab = ({ eventType, teamMembers }: EventTeamAssignmentTabProps) => {
  const { t } = useLocale();
  const { watch, setValue } = useFormContext<FormValues>();
  const schedulingType = watch("schedulingType");
  const hosts = watch("hosts");

  const memberOptions = useMemo(
    () =>
      teamMembers.map((member) => ({
        value: String(member.id),
        label: member.name || member.username || member.email || String(member.id),
        avatar: member.avatar,
      })),
    [teamMembers]
  );

  const selectedMembers = useMemo(
    () =>
      hosts
        .map((host) => memberOptions.find((option) => Number(option.value) === host.userId))
        .filter((option): option is (typeof memberOptions)[number] => option !== undefined),
    [hosts, memberOptions]
  );

  const buildDefaultHost = (userId: number): Host => ({
    userId,
    isFixed: schedulingType === SchedulingType.COLLECTIVE,
    priority: 2,
    weight: 100,
    scheduleId: null,
    groupId: null,
  });

  const updateHostsBySelectedUsers = (selectedUserIds: number[]) => {
    const existingById = new Map(hosts.map((host) => [host.userId, host]));
    const nextHosts = selectedUserIds.map((userId) => existingById.get(userId) ?? buildDefaultHost(userId));

    setValue("hosts", nextHosts, { shouldDirty: true });
  };

  if (eventType.schedulingType === SchedulingType.MANAGED) {
    return <p className="text-sm text-subtle">{t("readonly")}</p>;
  }

  return (
    <div className="stack-y-6">
      <div>
        <h3 className="font-semibold text-emphasis text-sm">{t("assignment")}</h3>
        <p className="mt-1 text-sm text-subtle">{t("assignment_description")}</p>
      </div>

      <div className="grid gap-3">
        {assignmentOptions.map((option) => {
          const isSelected = schedulingType === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setValue("schedulingType", option.value, {
                  shouldDirty: true,
                });

                if (option.value === SchedulingType.COLLECTIVE) {
                  setValue(
                    "hosts",
                    hosts.map((host) => ({ ...host, isFixed: true })),
                    { shouldDirty: true }
                  );
                }
              }}
              className={classNames(
                "rounded-md border p-4 text-left transition-colors",
                isSelected
                  ? "border-emphasis bg-subtle"
                  : "border-subtle bg-default hover:border-default"
              )}>
              <p className="font-medium text-sm text-emphasis">{t(option.labelKey)}</p>
              <p className="mt-1 text-sm text-subtle">{t(option.descriptionKey)}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-md border border-subtle p-4">
        <Label className="mb-2 block text-sm font-medium text-emphasis">{t("team_members")}</Label>
        <CheckedUserSelect
          options={memberOptions}
          value={selectedMembers}
          onChange={(value) => {
            updateHostsBySelectedUsers(value.map((item) => Number(item.value)));
          }}
        />
      </div>

      {schedulingType === SchedulingType.ROUND_ROBIN && hosts.length > 0 && (
        <div className="rounded-md border border-subtle p-4">
          <Label className="mb-3 block text-sm font-medium text-emphasis">{t("fixed_round_robin")}</Label>
          <div className="stack-y-2">
            {hosts.map((host, index) => {
              const member = teamMembers.find((teamMember) => teamMember.id === host.userId);
              const memberName =
                member?.name || member?.username || member?.email || String(host.userId);

              return (
                <CheckboxField
                  key={host.userId}
                  checked={Boolean(host.isFixed)}
                  description={memberName}
                  onChange={(e) => {
                    setValue(`hosts.${index}.isFixed`, e.target.checked, { shouldDirty: true });
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventTeamAssignmentTab;
