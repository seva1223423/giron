/** Mock for expo-server-sdk — prevents ESM parse errors in Jest. */
export default class Expo {
  static isExpoPushToken(_token: string): boolean { return true; }
  async sendPushNotificationsAsync(_messages: any[]): Promise<any[]> { return []; }
  async getPushNotificationReceiptsAsync(_ids: string[]): Promise<any> { return {}; }
  chunkPushNotifications(messages: any[]): any[][] { return [messages]; }
}

export type ExpoPushMessage = any;
export type ExpoPushTicket = any;
export type ExpoPushReceipt = any;
