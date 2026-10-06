import { describe, expect, it } from 'vitest';
import { buildHarness } from './helpers/testHarness.js';

describe('happy path', () => {
  it('creates a campaign in DRAFT status', () => {
    const { service } = buildHarness();

    const campaign = service.createCampaign('Q4 Launch');

    expect(campaign.status).toBe('DRAFT');
    expect(campaign.name).toBe('Q4 Launch');
  });

  it('launches a campaign end-to-end and becomes ACTIVE with an externalId', async () => {
    const { service, worker } = buildHarness();

    const campaign = service.createCampaign('Q4 Launch');
    service.requestLaunch(campaign.id);

    await worker.drain();

    const finalCampaign = service.getCampaign(campaign.id);
    expect(finalCampaign?.status).toBe('ACTIVE');
    expect(finalCampaign?.externalId).toBeDefined();
  });

  it('processes multiple independent campaigns without interference', async () => {
    const { service, worker } = buildHarness();

    const campaignA = service.createCampaign('Campaign A');
    const campaignB = service.createCampaign('Campaign B');
    service.requestLaunch(campaignA.id);
    service.requestLaunch(campaignB.id);

    await worker.drain();

    const finalA = service.getCampaign(campaignA.id);
    const finalB = service.getCampaign(campaignB.id);

    expect(finalA?.status).toBe('ACTIVE');
    expect(finalB?.status).toBe('ACTIVE');
    expect(finalA?.externalId).not.toBe(finalB?.externalId);
  });

  it('moves a campaign to LAUNCHING as soon as a launch is requested', () => {
    const { service } = buildHarness();

    const campaign = service.createCampaign('Q4 Launch');
    service.requestLaunch(campaign.id);

    expect(service.getCampaign(campaign.id)?.status).toBe('LAUNCHING');
  });

  it('rejects a launch request for a campaign that does not exist', () => {
    const { service } = buildHarness();

    expect(() => service.requestLaunch('not-a-real-id')).toThrow();
  });

  it('processNext handles exactly one queued job per call', async () => {
    const { service, worker, queue } = buildHarness();

    const campaignA = service.createCampaign('Campaign A');
    const campaignB = service.createCampaign('Campaign B');
    service.requestLaunch(campaignA.id);
    service.requestLaunch(campaignB.id);

    expect(queue.size()).toBe(2);

    await worker.processNext();

    expect(queue.size()).toBe(1);
    const processed = [campaignA, campaignB].filter(
      (c) => service.getCampaign(c.id)?.status === 'ACTIVE'
    );
    expect(processed).toHaveLength(1);
  });
});
