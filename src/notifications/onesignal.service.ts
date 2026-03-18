import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OneSignalService {
  private readonly logger = new Logger(OneSignalService.name);
  private readonly appId = process.env.ONESIGNAL_APP_ID;
  private readonly apiKey = process.env.ONESIGNAL_REST_API_KEY;
  private readonly baseUrl = 'https://onesignal.com/api/v1/notifications';

  private get isConfigured(): boolean {
    return !!(this.appId && this.apiKey);
  }

  private async send(body: Record<string, any>): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn('OneSignal is not configured — skipping push notification');
      return;
    }

    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${this.apiKey}`,
        },
        body: JSON.stringify({ app_id: this.appId, ...body }),
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`OneSignal error ${res.status}: ${text}`);
      }
    } catch (error) {
      this.logger.error(`OneSignal request failed: ${error.message}`);
    }
  }

  /**
   * Envía notificación push a todos los dispositivos de una empresa.
   * Requiere que los clientes registren el tag: { companyId: "<id>" }
   */
  async sendToCompany(
    companyId: string,
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<void> {
    await this.send({
      headings: { en: title, es: title },
      contents: { en: message, es: message },
      filters: [
        { field: 'tag', key: 'companyId', relation: '=', value: companyId },
      ],
      data,
    });
  }

  /**
   * Envía notificación push a un usuario específico.
   * Requiere que el cliente llame a OneSignal.setExternalUserId(userId).
   */
  async sendToUser(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<void> {
    await this.send({
      headings: { en: title, es: title },
      contents: { en: message, es: message },
      include_aliases: { external_id: [userId] },
      target_channel: 'push',
      data,
    });
  }
}
