// Server-only transactional email via Resend -- API-key based, no SMTP
// setup needed. RESEND_API_KEY is a true secret, same posture as
// DAILY_API_KEY (lib/daily.ts): only ever read here, never in a "use
// client" file or passed to the browser.
//
// BOOKING_EMAIL_FROM defaults to Resend's own sandbox sender
// ("onboarding@resend.dev"), which works immediately with no setup --
// but Resend restricts that address to sending only to the account
// owner's own verified email. Real bookers won't receive anything until
// a real sending domain is verified in Resend and BOOKING_EMAIL_FROM is
// pointed at an address on it.

import { Resend } from "resend";

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set -- booking emails have nothing to send through.");
  return new Resend(key);
}

const FROM_ADDRESS = process.env.BOOKING_EMAIL_FROM ?? "onboarding@resend.dev";

function formatRange(startIso: string, endIso: string, timezone: string | null): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const tz = timezone ?? undefined;
  const startLabel = start.toLocaleString(undefined, {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const endLabel = end.toLocaleTimeString(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" });
  return `${startLabel} – ${endLabel}`;
}

export interface BookingEmailInput {
  bookerName: string;
  bookerEmail?: string;
  coachName: string | null;
  coachEmail: string;
  coachTimezone: string | null;
  title: string;
  startTime: string;
  endTime: string;
}

// Sends the coach a "you've been booked" notice, and -- if the booker
// gave an email -- a confirmation back to them too. Both in one call
// since they're cheap and always sent together; the caller treats this
// whole thing as best-effort (see submitBooking), so a partial failure
// here (one send succeeds, the other doesn't) just means one fewer email
// went out, not a failed booking.
export async function sendBookingEmails(input: BookingEmailInput): Promise<void> {
  const resend = client();
  const range = formatRange(input.startTime, input.endTime, input.coachTimezone);

  const sends: Promise<unknown>[] = [
    resend.emails.send({
      from: FROM_ADDRESS,
      to: input.coachEmail,
      subject: `New booking: ${input.title}`,
      text: `${input.bookerName} booked ${range}.\n\n${input.title}`,
    }),
  ];

  if (input.bookerEmail) {
    sends.push(
      resend.emails.send({
        from: FROM_ADDRESS,
        to: input.bookerEmail,
        subject: `Booking confirmed: ${input.title}`,
        text: `You're booked with ${input.coachName ?? "your coach"} for ${range}.\n\n${input.title}`,
      }),
    );
  }

  await Promise.all(sends);
}
