import { describe, expect, it } from 'vitest';
import { CampaignStore } from '../src/store/campaignStore.js';
import { InMemoryQueue } from '../src/queue/inMemoryQueue.js';
import { FakeMetaClient } from '../src/external/fakeMetaClient.js';
import { CampaignService } from '../src/service/campaignService.js';
import { LaunchWorker } from '../src/worker/launchWorker.js';
import type { LaunchJob } from '../src/domain/types.js';

/**
 * Reality #5: "A worker process can be interrupted (crash, redeploy, restart)
 * between an external call completing and the result being saved locally."
 *
 * The create-then-crash half is covered by idempotency (a later retry
 * reconciles via lookupByRequestKey). This file covers the other half: a
 * worker that claims a campaign and then dies, leaving it stranded in
 * IN_PROGRESS. Without a lease, no other worker could ever reclaim it. With a
 * lease, a healthy worker reclaims it once the lease expires.
 *
 * The clock is injected into the store, so lease expiry is driven by advancing
 * a counter — no real timers, sleeps, or randomness.
 */
const LEASE_MS = 1_000;

function buildWithClock() {
  let clock = 0;
  const now = () => clock;
  const advance = (ms: number) => {
    clock += ms;
  };

  const store = new CampaignStore({ now });
  const queue = new InMemoryQueue<LaunchJob>();
  const metaClient = new FakeMetaClient({ scenarioFor: () => 'SUCCESS' });
  const service = new CampaignService(store, queue);
  const worker = new LaunchWorker(queue, store, metaClient, { leaseMs: LEASE_MS });

  return { store, queue, metaClient, service, worker, advance };
}

describe('crash recovery: stranded IN_PROGRESS lease', () => {
  it('a healthy worker reclaims a campaign a crashed worker left stranded, once the lease expires', async () => {
    const { store, queue, metaClient, service, worker, advance } = buildWithClock();

    const campaign = service.createCampaign('Q4 Launch');
    const job = service.requestLaunch(campaign.id);

    // Simulate a worker that claimed the campaign and then crashed mid-flight:
    // the store is left in IN_PROGRESS with a live lease, and the job is still
    // on the queue (it will be redelivered).
    const claimed = store.claimForLaunch(campaign.id, LEASE_MS);
    expect(claimed).toBe(true);
    expect(store.get(campaign.id)?.status).toBe('IN_PROGRESS');
    queue.enqueue(job);

    // Before the lease expires, a healthy worker must NOT steal the claim.
    advance(LEASE_MS - 1);
    await worker.drain();
    expect(store.get(campaign.id)?.status).toBe('IN_PROGRESS');

    // Once the lease expires, the healthy worker reclaims and completes it.
    advance(2); // now strictly past expiry
    queue.enqueue(job);
    await worker.drain();

    const external = await metaClient.lookupByRequestKey(job.requestKey);
    expect(external).toHaveLength(1);

    const finalCampaign = store.get(campaign.id);
    expect(finalCampaign?.status).toBe('ACTIVE');
    expect(finalCampaign?.externalId).toBe(external[0]!.externalId);
    expect(finalCampaign?.leaseExpiresAt).toBeUndefined();
  });

  it('an expired-lease reclaim still produces only one external campaign if the crashed worker had already created it', async () => {
    // Crashed worker had already created the external campaign before dying
    // (create succeeded, local save never happened). The reclaiming worker must
    // adopt that record via reconcile, not create a duplicate.
    const { store, queue, metaClient, service, worker, advance } = buildWithClock();

    const campaign = service.createCampaign('Q4 Launch');
    const job = service.requestLaunch(campaign.id);

    // Crashed worker: claimed, created externally, then died before saving.
    store.claimForLaunch(campaign.id, LEASE_MS);
    await metaClient.createCampaign({ requestKey: job.requestKey, name: campaign.name });
    queue.enqueue(job);

    // Lease expires; healthy worker reclaims and reconciles.
    advance(LEASE_MS + 1);
    await worker.drain();

    const external = await metaClient.lookupByRequestKey(job.requestKey);
    expect(external).toHaveLength(1);

    const finalCampaign = store.get(campaign.id);
    expect(finalCampaign?.status).toBe('ACTIVE');
    expect(finalCampaign?.externalId).toBe(external[0]!.externalId);
  });
});
