import { describe, expect, it } from 'vitest';
import { buildHarness } from './helpers/testHarness.js';
import type { MetaScenario } from '../src/external/fakeMetaClient.js';

/**
 * Reality #3 and #4: a request to the external platform can time out before
 * the platform did anything, OR after it already created the campaign — and
 * nothing in the response tells you which.
 *
 * The dangerous case is TIMEOUT_AFTER_CREATE: the side effect happened but the
 * caller never found out. It must NOT be treated the same as "nothing
 * happened, safe to retry." We reconcile via lookupByRequestKey: if a record
 * exists we adopt it (ACTIVE), otherwise it is genuinely safe to retry.
 */
describe('ambiguous timeout handling', () => {
  it('TIMEOUT_AFTER_CREATE: adopts the orphaned external campaign instead of failing', async () => {
    const { service, worker, metaClient } = buildHarness(() => 'TIMEOUT_AFTER_CREATE');

    const campaign = service.createCampaign('Q4 Launch');
    const job = service.requestLaunch(campaign.id);

    await worker.drain();

    // The platform really did create a campaign for this requestKey.
    const external = await metaClient.lookupByRequestKey(job.requestKey);
    expect(external).toHaveLength(1);

    // The side effect happened, so the local record must reflect that: it
    // must NOT be left as FAILED (which would invite a retry and a duplicate).
    const finalCampaign = service.getCampaign(campaign.id);
    expect(finalCampaign?.status).toBe('ACTIVE');
    expect(finalCampaign?.externalId).toBe(external[0]!.externalId);
  });

  it('TIMEOUT_BEFORE_CREATE: nothing was created, campaign is not left ACTIVE', async () => {
    const { service, worker, metaClient } = buildHarness(() => 'TIMEOUT_BEFORE_CREATE');

    const campaign = service.createCampaign('Q4 Launch');
    const job = service.requestLaunch(campaign.id);

    await worker.drain();

    // Nothing was created externally.
    const external = await metaClient.lookupByRequestKey(job.requestKey);
    expect(external).toHaveLength(0);

    // No external campaign exists, so we must not claim success.
    const finalCampaign = service.getCampaign(campaign.id);
    expect(finalCampaign?.status).not.toBe('ACTIVE');
    expect(finalCampaign?.externalId).toBeUndefined();
  });

  it('TIMEOUT_BEFORE_CREATE then a retry that succeeds yields exactly one campaign', async () => {
    // First attempt times out before create; a later retry succeeds. Because
    // nothing was created the first time, the retry is safe and must produce
    // exactly one external campaign.
    let attempt = 0;
    const scenarioFor = (): MetaScenario =>
      attempt++ === 0 ? 'TIMEOUT_BEFORE_CREATE' : 'SUCCESS';

    const { service, worker, store, queue, metaClient } = buildHarness(scenarioFor);

    const campaign = service.createCampaign('Q4 Launch');
    const job = service.requestLaunch(campaign.id);

    await worker.drain();

    // Re-request a launch (resets to LAUNCHING) and retry the same job.
    store.setStatus(campaign.id, 'LAUNCHING');
    queue.enqueue(job);
    await worker.drain();

    const external = await metaClient.lookupByRequestKey(job.requestKey);
    expect(external).toHaveLength(1);

    const finalCampaign = service.getCampaign(campaign.id);
    expect(finalCampaign?.status).toBe('ACTIVE');
    expect(finalCampaign?.externalId).toBe(external[0]!.externalId);
  });
});
