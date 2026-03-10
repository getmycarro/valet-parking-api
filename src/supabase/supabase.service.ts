import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly client: SupabaseClient;
  private readonly channels = new Map<string, RealtimeChannel>();

  constructor(private config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !key) {
      this.logger.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — Realtime disabled');
    }

    this.client = createClient(url, key, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }

  async broadcast(channelName: string, event: string, payload: Record<string, any>) {
    try {
      let channel = this.channels.get(channelName);

      if (!channel) {
        channel = this.client.channel(channelName);
        await new Promise<void>((resolve) => channel.subscribe(() => resolve()));
        this.channels.set(channelName, channel);
      }

      await channel.send({ type: 'broadcast', event, payload });
    } catch (error) {
      this.logger.error(`Broadcast failed on channel "${channelName}": ${error.message}`);
    }
  }

  async onModuleDestroy() {
    for (const channel of this.channels.values()) {
      await this.client.removeChannel(channel);
    }
  }
}
