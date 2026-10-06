import type { LaunchJob } from '../domain/types.js';
import { CampaignStore } from '../store/campaignStore.js';
import { InMemoryQueue } from '../queue/inMemoryQueue.js';
import { FakeMetaClient } from '../external/fakeMetaClient.js';

/**
 * Processes queued launch jobs by asking the external platform to
 * create the campaign, then persisting the result locally.
 */
export class LaunchWorker {
  constructor(
    private queue: InMemoryQueue<LaunchJob>,
    private store: CampaignStore,
    private metaClient: FakeMetaClient
  ) {}

  /** Processes a single queued job, if one is available. */
  async processNext(): Promise<void> {
    const job = this.queue.dequeue();
    if (!job) return;
    await this.handle(job);
  }

  /** Drains the queue, processing jobs one at a time. */
  async drain(): Promise<void> {
    let job = this.queue.dequeue();
    while (job) {
      await this.handle(job);
      job = this.queue.dequeue();
    }
  }

  async handle(job: LaunchJob): Promise<void> {
    const campaign = this.store.get(job.campaignId);
    if (!campaign) return;

    try {
      const result = await this.metaClient.createCampaign({
        requestKey: job.requestKey,
        name: campaign.name,
      });

      this.store.update(job.campaignId, {
        status: 'ACTIVE',
        externalId: result.externalId,
      });
    } catch {
      this.store.update(job.campaignId, { status: 'FAILED' });
    }
  }
}
