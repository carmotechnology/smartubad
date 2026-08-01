import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Notification transport.
 *
 * v1 sends email only. The SMS path is written and wired but disabled — adding
 * Hormuud (or any other gateway) means implementing `sendSms` in
 * `./sms.ts` and flipping `SMS_PROVIDER`. No caller changes.
 *
 * Every call site uses `sendNotification`, which picks channels from the
 * message, so "also text the parent" later becomes a one-line change here
 * rather than a hunt through the codebase.
 */

export type NotificationChannel = "email" | "sms";

export type NotificationRecipient = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  locale?: string | null;
};

export type NotificationMessage = {
  to: NotificationRecipient;
  subject: string;
  /** Plain text. Also the SMS body when the sms channel is enabled. */
  text: string;
  html?: string;
  channels?: NotificationChannel[];
  /** Tags the delivery for logs, e.g. 'invite', 'attendance.checkin'. */
  kind?: string;
};

export type DeliveryResult = {
  channel: NotificationChannel;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export async function sendNotification(
  message: NotificationMessage,
): Promise<DeliveryResult[]> {
  const channels = message.channels ?? ["email"];
  const results: DeliveryResult[] = [];

  if (channels.includes("email")) {
    results.push(await sendEmail(message));
  }

  if (channels.includes("sms")) {
    results.push(await sendSms(message));
  }

  return results;
}

// --- Email -----------------------------------------------------------------

export async function sendEmail(message: NotificationMessage): Promise<DeliveryResult> {
  const { notifications } = serverEnv();
  const to = message.to.email;

  if (!to) {
    return { channel: "email", ok: false, skipped: true, error: "no email address" };
  }

  if (notifications.provider === "console" || !notifications.resendApiKey) {
    // Development default: log instead of send, so nothing is accidentally
    // mailed to a real parent from a local machine or a preview deploy.
    console.info(
      [
        "",
        "──────── EMAIL (not sent — NOTIFICATIONS_PROVIDER=console) ────────",
        `to:      ${to}`,
        `subject: ${message.subject}`,
        `kind:    ${message.kind ?? "generic"}`,
        "",
        message.text,
        "───────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return { channel: "email", ok: true, skipped: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notifications.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: notifications.fromEmail,
        to: [to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[notifications] email send failed", response.status, body);
      return { channel: "email", ok: false, error: `${response.status} ${body}` };
    }

    return { channel: "email", ok: true };
  } catch (error) {
    console.error("[notifications] email transport error", error);
    return { channel: "email", ok: false, error: String(error) };
  }
}

// --- SMS (interface ready, provider not enabled in v1) ---------------------

export async function sendSms(message: NotificationMessage): Promise<DeliveryResult> {
  const { sms } = serverEnv();
  const to = message.to.phone;

  if (sms.provider === "none") {
    return { channel: "sms", ok: true, skipped: true, error: "sms provider disabled" };
  }

  if (!to) {
    return { channel: "sms", ok: false, skipped: true, error: "no phone number" };
  }

  if (sms.provider === "hormuud") {
    // Deliberately not implemented in v1. Left as the single place to fill in
    // when the account exists: authenticate, POST the message, map the result.
    console.warn("[notifications] Hormuud SMS is configured but not implemented in v1");
    return { channel: "sms", ok: false, skipped: true, error: "hormuud transport not implemented" };
  }

  return { channel: "sms", ok: false, skipped: true, error: `unknown sms provider ${sms.provider}` };
}
