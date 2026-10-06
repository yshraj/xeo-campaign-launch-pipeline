import { describe, expect, it } from 'vitest';
import { buildHarness } from './helpers/testHarness.js';

/**
 * Reality #1: "Job queues occasionally deliver the same logical job more
 * than once."
 *
 * Duplicate delivery of the same launch job must NOT result in duplicate
 * campaigns on the external platform. The requestKey is the idempotency key:
 * no matter how many times the same job is processed, the platform should end
 * up with exactly one campaign for that key, and the local campaign should
 * settle on a single externalId.
 */
describe('idempotency: duplicate job delivery', () => {
  it('processing the same job twice creates only one external campaign', async () => {
    const { service, worker, queue, metaClient } = buildHarness(() => 'SUCCESS');

    const campaign = service.createCampaign('Q4 Launch');
    const job = service.requestLaunch(campaign.id);

    // Simulate the queue redelivering the exact same logical job.
    queue.enqueue(job);

    await worker.drain();

    const external = await metaClient.lookupByRequestKey(job.requestKey);
    expect(external).toHaveLength(1);

    const finalCampaign = service.getCampaign(campaign.id);
    expect(finalCampaign?.status).toBe('ACTIVE');
    expect(finalCampaign?.externalId).toBe(external[0]!.externalId);
  });
});
