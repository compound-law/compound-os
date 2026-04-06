import webpush from "web-push";
import { eq, and, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { pushSubscriptions, companyMemberships } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@paperclip.ing";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function pushNotificationService(db: Db) {
  async function subscribe(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
      .then((rows) => rows[0] ?? null);

    if (existing) {
      return existing;
    }

    const [sub] = await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      })
      .returning();

    return sub;
  }

  async function unsubscribe(userId: string, endpoint: string) {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  async function getVapidPublicKey() {
    return VAPID_PUBLIC_KEY;
  }

  async function notifyUsers(userIds: string[], payload: { title: string; body: string; url?: string; icon?: string }) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
    if (userIds.length === 0) return;

    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, userIds));

    const payloadStr = JSON.stringify(payload);

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr,
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          logger.info({ endpoint: sub.endpoint }, "Removed expired push subscription");
        } else {
          logger.warn({ err, endpoint: sub.endpoint }, "Failed to send push notification");
        }
      }
    }
  }

  async function notifyCompanyMembers(companyId: string, payload: { title: string; body: string; url?: string; icon?: string }, excludeUserId?: string) {
    const members = await db
      .select({ userId: companyMemberships.principalId })
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.status, "active"),
        ),
      );

    const userIds = members
      .map((m) => m.userId)
      .filter((id) => id !== excludeUserId);

    await notifyUsers(userIds, payload);
  }

  return {
    subscribe,
    unsubscribe,
    getVapidPublicKey,
    notifyUsers,
    notifyCompanyMembers,
  };
}
