import * as OneSignal from 'onesignal-node';

const oneSignalClient = new OneSignal.Client(
  process.env.ONESIGNAL_APP_ID || '',
  process.env.ONESIGNAL_API_KEY || '',
);

export async function sendPushNotificationToDevices(
  playerIds: string[],
  title: string,
  message: string,
  data: any,
): Promise<void> {
  // Filter empty IDs
  const validIds = playerIds.filter(id => !!id);
  if (validIds.length === 0) {
    console.warn('[OneSignal] No valid player IDs to notify');
    return;
  }

  const notification = {
    headings: { en: title },
    contents: { en: message },
    include_subscription_ids: validIds,
    target_channel: 'push',
    data,
  };

  try {
    await oneSignalClient.createNotification(notification);
  } catch (error: any) {
    if (error instanceof OneSignal.HTTPError) {
      // Check for "not subscribed" errors (gracefully ignore them)
      const body = error.body as any;
      if (
        error.statusCode === 400 &&
        body?.errors &&
        Array.isArray(body.errors) &&
        body.errors.some((e: any) => typeof e === 'string' && e.includes('not subscribed'))
      ) {
        console.warn('[OneSignal] Some devices not subscribed, skipping');
        return;
      }
      console.error(`[OneSignal] HTTP error ${error.statusCode}:`, error.body);
    } else {
      console.error('[OneSignal] Error sending notification:', error);
    }
    throw error;
  }
}
