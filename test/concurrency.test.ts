import { describe, expect, it } from 'vitest';
import { buildHarness } from './helpers/testHarness.js';

/**
 * Reality #2: "More than one worker process can end up handling the same
 * operation at the same time."
 *
 * Two workers processing the SAME job concurrently must not produce an
 * incorrect or inconsistent result. In particular they must not both make it
 * past the reconcile-then-create window and create two external campaigns.
 *
 * This is deterministic: handle() has real `await` points, so starting both
 * calls and awaiting them together interleaves them on the microtask queue
 * with no reliance on timers, sleeps, or randomness.
 */
describe('concurrency: two workers, same job', () => {
  it('two workers handling the same job create only one external campaign', async () => {
    const { service, store, queue, metaClient } = buildHarness(() => 'SUCCESS');
    // Two independent workers sharing the same store, queue, and client.
    const { LaunchWorker } = await import('../src/worker/launchWorker.js');
    const workerA = new LaunchWorker(queue, store, metaClient);
    const workerB = new LaunchWorker(queue, store, metaClient);

    const campaign = service.createCampaign('Q4 Launch');
    const job = service.requestLaunch(campaign.id);

    // Both workers pick up the same logical job at the same time.
    await Promise.all([workerA.handle(job), workerB.handle(job)]);

    const external = await metaClient.lookupByRequestKey(job.requestKey);
    expect(external).toHaveLength(1);

    const finalCampaign = service.getCampaign(campaign.id);
    expect(finalCampaign?.status).toBe('ACTIVE');
    expect(finalCampaign?.externalId).toBe(external[0]!.externalId);
  });
});
