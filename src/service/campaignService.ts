import { randomUUID } from 'node:crypto';
import type { Campaign, LaunchJob } from '../domain/types.js';
import { CampaignStore } from '../store/campaignStore.js';
import { InMemoryQueue } from '../queue/inMemoryQueue.js';

export class CampaignService {
  constructor(
    private store: CampaignStore,
    private queue: InMemoryQueue<LaunchJob>
  ) {}

  createCampaign(name: string): Campaign {
    return this.store.create(name);
  }

  getCampaign(id: string): Campaign | undefined {
    return this.store.get(id);
  }

  requestLaunch(campaignId: string): LaunchJob {
    const campaign = this.store.get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    this.store.update(campaignId, { status: 'LAUNCHING' });

    const job: LaunchJob = {
      campaignId,
      requestKey: randomUUID(),
    };

    this.queue.enqueue(job);
    return job;
  }
}
