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

    // Idempotency guard #1: if this campaign has already settled on an
    // external campaign, a redelivered job is a no-op. Nothing to do.
    if (campaign.status === 'ACTIVE' && campaign.externalId) {
      return;
    }

    // Idempotency guard #2: the external platform does no deduplication of
    // its own, so before creating anything we ask whether a campaign already
    // exists for this requestKey. If a previous delivery of this same logical
    // job already created it, we adopt that record instead of creating a
    // second one. requestKey is our idempotency key.
    const existing = await this.metaClient.lookupByRequestKey(job.requestKey);
    if (existing.length > 0) {
      this.store.update(job.campaignId, {
        status: 'ACTIVE',
        externalId: existing[0]!.externalId,
      });
      return;
    }

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
