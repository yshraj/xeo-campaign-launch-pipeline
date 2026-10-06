import type { LaunchJob } from '../domain/types.js';
import { CampaignStore } from '../store/campaignStore.js';
import { InMemoryQueue } from '../queue/inMemoryQueue.js';
import { FakeMetaClient, MetaTimeoutError } from '../external/fakeMetaClient.js';

/**
 * Processes queued launch jobs by asking the external platform to
 * create the campaign, then persisting the result locally.
 */
/**
 * How long a worker's claim on a campaign is valid. If a worker crashes
 * mid-flight, another worker may reclaim the campaign only after this window
 * elapses. It must comfortably exceed the longest expected external call so a
 * slow-but-alive worker is not reclaimed out from under itself.
 */
const DEFAULT_LEASE_MS = 30_000;

export class LaunchWorker {
  private readonly leaseMs: number;

  constructor(
    private queue: InMemoryQueue<LaunchJob>,
    private store: CampaignStore,
    private metaClient: FakeMetaClient,
    opts?: { leaseMs?: number }
  ) {
    this.leaseMs = opts?.leaseMs ?? DEFAULT_LEASE_MS;
  }

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

    // Concurrency + recovery guard: atomically claim this campaign (taking out
    // a time-bounded lease) before doing any async work. The claim runs
    // synchronously, so of N workers racing on the same job exactly one wins
    // and the losers back off here, never reaching the external call. The lease
    // also lets a healthy worker reclaim a campaign that a crashed worker left
    // stranded in IN_PROGRESS, once that lease has expired.
    const claimed = this.store.claimForLaunch(job.campaignId, this.leaseMs);
    if (!claimed) {
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
        leaseExpiresAt: undefined,
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
        leaseExpiresAt: undefined,
      });
    } catch (err) {
      if (err instanceof MetaTimeoutError) {
        // A timeout means "I don't know what happened" — the campaign may or
        // may not have been created, and the response doesn't tell us. We must
        // NOT treat this as a plain failure, because doing so would invite a
        // retry that could create a duplicate. Reconcile by asking the platform
        // whether a record exists for this requestKey.
        const existing = await this.metaClient.lookupByRequestKey(job.requestKey);
        if (existing.length > 0) {
          // The side effect did happen (TIMEOUT_AFTER_CREATE). Adopt the
          // orphaned external campaign rather than failing.
          this.store.update(job.campaignId, {
            status: 'ACTIVE',
            externalId: existing[0]!.externalId,
            leaseExpiresAt: undefined,
          });
          return;
        }
        // Nothing was created (TIMEOUT_BEFORE_CREATE). It is genuinely safe to
        // retry, so release the claim back to LAUNCHING rather than terminally
        // failing.
        this.store.update(job.campaignId, {
          status: 'LAUNCHING',
          leaseExpiresAt: undefined,
        });
        return;
      }

      // A non-timeout error is an unambiguous failure.
      this.store.update(job.campaignId, {
        status: 'FAILED',
        leaseExpiresAt: undefined,
      });
    }
  }
}
