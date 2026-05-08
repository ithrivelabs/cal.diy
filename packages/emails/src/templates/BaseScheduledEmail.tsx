import dayjs from "@calcom/dayjs";
import { formatPrice } from "@calcom/lib/currencyConversions";
import { getCancelLink, getRescheduleLink } from "@calcom/lib/CalEventParser";
import { getVideoCallUrlFromCalEvent } from "@calcom/lib/CalEventParser";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import {
  AppsStatus,
  BaseEmailHtml,
  Info,
  ManageLink,
  UserFieldsResponses,
} from "../components";
import { PersonInfo } from "../components/WhoInfo";

export const BaseScheduledEmail = (
  props: {
    calEvent: CalendarEvent;
    attendee: Person;
    timeZone: string;
    includeAppsStatus?: boolean;
    t: TFunction;
    locale: string;
    timeFormat: TimeFormat | undefined;
    isOrganizer?: boolean;
    reassigned?: { name: string | null; email: string; reason?: string; byUser?: string };
  } & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  const { t, timeZone, timeFormat: timeFormat_ } = props;

  const timeFormat = timeFormat_ ?? TimeFormat.TWELVE_HOUR;

  function getRecipientStart(format: string) {
    return dayjs(props.calEvent.startTime).tz(timeZone).format(format);
  }

  function getRecipientEnd(format: string) {
    return dayjs(props.calEvent.endTime).tz(timeZone).format(format);
  }

  const sessionTitle = props.calEvent.title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\sbetween\s.+?)\1$/i, "$1");
  const sessionDate = `${getRecipientStart("ddd, MMM D YYYY")} · ${getRecipientStart(
    timeFormat === TimeFormat.TWELVE_HOUR ? "h:mm A" : "HH:mm"
  )} - ${getRecipientEnd(timeFormat === TimeFormat.TWELVE_HOUR ? "h:mm A" : "HH:mm")}`;
  const timezoneShort = getRecipientStart("z");
  const shouldShowTimezoneChip = Boolean(timezoneShort) && timezoneShort.toLowerCase() !== "z";
  const googleMeetLogo = `${WEBAPP_URL}/emails/google-meet-logo.png`;
  const ithriveTopLogo = `https://res.cloudinary.com/dhlsvwpny/image/upload/v1778222239/Logo_zvjaut.svg`;

  const locationLabel = (() => {
    const location = props.calEvent.location ?? "";
    if (location.includes("google:meet")) return "Google Meet";
    if (location.includes("integrations:daily")) return "Cal Video";
    if (location.includes("zoom")) return "Zoom";
    if (location.includes("office365")) return "Microsoft Teams";
    return location || t("no_location");
  })();
  const isGoogleMeet = locationLabel === "Google Meet";
  const meetingUrl = getVideoCallUrlFromCalEvent(props.calEvent) || undefined;

  const cancelLink = getCancelLink(
    {
      platformClientId: props.calEvent.platformClientId,
      platformCancelUrl: props.calEvent.platformCancelUrl,
      type: props.calEvent.type,
      organizer: props.calEvent.organizer,
      recurringEvent: props.calEvent.recurringEvent,
      bookerUrl: props.calEvent.bookerUrl,
      uid: props.calEvent.uid,
      attendeeSeatId: props.calEvent.attendeeSeatId,
      team: props.calEvent.team,
    },
    props.attendee
  );
  const rescheduleLink = getRescheduleLink({ calEvent: props.calEvent, attendee: props.attendee });

  const canManage =
    props.attendee.email === props.calEvent.attendees[0]?.email ||
    props.calEvent.organizer.email === props.attendee.email ||
    Boolean(props.calEvent.team?.members.some((member) => props.attendee.email === member.email));
  const showReschedule = canManage && Boolean(rescheduleLink) && !props.calEvent.disableRescheduling;
  const showCancel = canManage && Boolean(cancelLink) && !props.calEvent.disableCancelling;

  const subject = t(props.subject || "confirmed_event_type_subject", {
    eventType: props.calEvent.type,
    name: props.calEvent.team?.name || props.calEvent.organizer.name,
    date: `${getRecipientStart("h:mma")} - ${getRecipientEnd("h:mma")}, ${t(
      getRecipientStart("dddd").toLowerCase()
    )}, ${t(getRecipientStart("MMMM").toLowerCase())} ${getRecipientStart("D, YYYY")}`,
    interpolation: { escapeValue: false },
  });

  let rescheduledBy = props.calEvent.rescheduledBy;
  if (
    rescheduledBy &&
    rescheduledBy === props.calEvent.organizer.email &&
    props.calEvent.hideOrganizerEmail
  ) {
    const personWhoRescheduled = [props.calEvent.organizer, ...props.calEvent.attendees].find(
      (person) => person.email === rescheduledBy
    );
    rescheduledBy = personWhoRescheduled?.name;
  }

  return (
    <BaseEmailHtml
      hideLogo={Boolean(props.calEvent.platformClientId) || Boolean(props.calEvent.hideBranding)}
      headerType={props.headerType || "checkCircle"}
      topLogoSrc={ithriveTopLogo}
      topLogoAlt="iThrive"
      topLogoWidth={150}
      topLogoHeight={150}
      subject={props.subject || subject}
      title={t("your_event_has_been_scheduled")}
      callToAction={
        props.callToAction === null
          ? null
          : props.callToAction || (
              <div style={{ textAlign: "center", fontFamily: "IBM Plex Sans, Arial, sans-serif" }}>
                <p style={{ marginBottom: 12, color: "#737373", fontSize: 14 }}>Need to make a change?</p>
                {showReschedule && (
                  <a
                    href={rescheduleLink ?? "#"}
                    style={{
                      display: "inline-block",
                      marginRight: 8,
                      background: "#C4704A",
                      color: "#FEFDFB",
                      padding: "10px 16px",
                      borderRadius: 8,
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: 600,
                    }}>
                    {t("reschedule")}
                  </a>
                )}
                {showCancel && (
                  <a
                    href={cancelLink ?? "#"}
                    style={{
                      display: "inline-block",
                      border: "1px solid #D4CFC6",
                      color: "#4A4A4A",
                      padding: "10px 16px",
                      borderRadius: 8,
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: 600,
                    }}>
                    {t("cancel")}
                  </a>
                )}
                {!showReschedule && !showCancel && <ManageLink attendee={props.attendee} calEvent={props.calEvent} />}
              </div>
            )
      }
      subtitle={props.subtitle || <>A calendar invite has been sent to all participants.</>}>
      <div style={{ border: "1px solid #E8E4DE", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #E8E4DE" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#A3A3A3",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}>
            Session
          </div>
          <div style={{ color: "#1A1A1A", fontSize: 15, fontWeight: 600 }}>{sessionTitle}</div>
        </div>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #E8E4DE" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#A3A3A3",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}>
            Date & Time
          </div>
          <div style={{ color: "#1A1A1A", fontSize: 14, fontFamily: "IBM Plex Mono, monospace" }}>
            {sessionDate}
            {shouldShowTimezoneChip && (
              <>
                {" "}
                <span
                  style={{
                    display: "inline-block",
                    marginLeft: 6,
                    border: "1px solid #E8D5CC",
                    background: "#FAF6F3",
                    color: "#C4704A",
                    borderRadius: 9999,
                    padding: "2px 8px",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                  }}>
                  {timezoneShort}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #E8E4DE" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#A3A3A3",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}>
            Participants
          </div>
          <div style={{ color: "#1A1A1A", fontSize: 14, lineHeight: 1.7 }}>
            <div>
              <strong>{props.calEvent.organizer.name || "Organizer"}</strong> - Organizer{" "}
              {props.calEvent.organizer.email}
            </div>
            {props.calEvent.attendees.map((attendee) => (
              <div key={attendee.email}>
                <strong>{attendee.name || "Guest"}</strong> - Guest {attendee.email}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #E8E4DE" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#A3A3A3",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}>
            Meeting
          </div>
          {isGoogleMeet ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid #E8E4DE",
                background: "#FAF8F5",
                borderRadius: 8,
                padding: "10px 12px",
              }}>
              {/* <img
                src={googleMeetLogo}
                alt="Google Meet"
                style={{ width: 20, height: 20, display: "block", border: 0 }}
              /> */}
              <div>
                <div style={{ color: "#1A1A1A", fontSize: 14, fontWeight: 600 }}>Google Meet</div>
                {meetingUrl ? (
                  <div style={{ marginTop: 2 }}>
                    <a
                      href={meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "#2D5A4A",
                        fontSize: 12,
                        fontFamily: "IBM Plex Mono, monospace",
                        textDecoration: "underline",
                        wordBreak: "break-all",
                      }}>
                      {meetingUrl}
                    </a>
                  </div>
                ) : (
                  <div style={{ color: "#737373", fontSize: 12 }}>Link included in your calendar invite</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: "#1A1A1A", fontSize: 14 }}>{locationLabel}</div>
          )}
        </div>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #E8E4DE" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#A3A3A3",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}>
            Description
          </div>
          <div style={{ color: "#1A1A1A", fontSize: 14 }}>{props.calEvent.description || "-"}</div>
        </div>
        {props.calEvent.additionalNotes && (
          <div style={{ padding: "16px 18px" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#A3A3A3",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}>
              Additional Notes
            </div>
            <div style={{ color: "#1A1A1A", fontSize: 14 }}>{props.calEvent.additionalNotes}</div>
          </div>
        )}
      </div>
      {props.calEvent.rejectionReason && (
        <>
          <Info label={t("rejection_reason")} description={props.calEvent.rejectionReason} withSpacer />
        </>
      )}
      {props.calEvent.cancellationReason && (
        <Info
          label={t(
            props.calEvent.cancellationReason.startsWith("$RCH$")
              ? "reason_for_reschedule"
              : "cancellation_reason"
          )}
          description={
            !!props.calEvent.cancellationReason && props.calEvent.cancellationReason.replace("$RCH$", "")
          } // Removing flag to distinguish reschedule from cancellation
          withSpacer
        />
      )}
      {props.reassigned && !props.reassigned.byUser && (
        <>
          <Info
            label={t("reassigned_to")}
            description={
              <PersonInfo name={props.reassigned.name || undefined} email={props.reassigned.email} />
            }
            withSpacer
          />
          {props.reassigned?.reason && (
            <Info label={t("reason")} description={props.reassigned.reason} withSpacer />
          )}
        </>
      )}
      {props.reassigned && props.reassigned.byUser && (
        <>
          <Info label={t("reassigned_by")} description={props.reassigned.byUser} withSpacer />
          {props.reassigned?.reason && (
            <Info label={t("reason")} description={props.reassigned.reason} withSpacer />
          )}
        </>
      )}
      {rescheduledBy && <Info label={t("rescheduled_by")} description={rescheduledBy} withSpacer />}
      {props.includeAppsStatus && <AppsStatus calEvent={props.calEvent} t={t} />}
      {props.isOrganizer && props.calEvent.assignmentReason && (
        <Info
          label={t("assignment_reason")}
          description={`${t(props.calEvent.assignmentReason.category)}${props.calEvent.assignmentReason.details ? `: ${props.calEvent.assignmentReason.details}` : ""}`}
          withSpacer
        />
      )}
      <UserFieldsResponses t={t} calEvent={props.calEvent} isOrganizer={props.isOrganizer} />
      {props.calEvent.paymentInfo?.amount && (
        <Info
          label={props.calEvent.paymentInfo.paymentOption === "HOLD" ? t("no_show_fee") : t("price")}
          description={formatPrice(
            props.calEvent.paymentInfo.amount,
            props.calEvent.paymentInfo.currency,
            props.attendee.language.locale
          )}
          withSpacer
        />
      )}
    </BaseEmailHtml>
  );
};
