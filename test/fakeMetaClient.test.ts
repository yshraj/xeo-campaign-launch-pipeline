import { describe, expect, it } from 'vitest';
import { FakeMetaClient, MetaTimeoutError } from '../src/external/fakeMetaClient.js';

describe('FakeMetaClient', () => {
  it('SUCCESS creates a campaign and makes it discoverable by requestKey', async () => {
    const client = new FakeMetaClient({ scenarioFor: () => 'SUCCESS' });

    const result = await client.createCampaign({ requestKey: 'req-1', name: 'Test Campaign' });
    const found = await client.lookupByRequestKey('req-1');

    expect(result.externalId).toBeDefined();
    expect(found).toHaveLength(1);
    expect(found[0]!.externalId).toBe(result.externalId);
  });

  it('TIMEOUT_BEFORE_CREATE throws and leaves nothing to discover', async () => {
    const client = new FakeMetaClient({ scenarioFor: () => 'TIMEOUT_BEFORE_CREATE' });

    await expect(
      client.createCampaign({ requestKey: 'req-2', name: 'Test Campaign' })
    ).rejects.toThrow(MetaTimeoutError);

    const found = await client.lookupByRequestKey('req-2');
    expect(found).toHaveLength(0);
  });

  it('TIMEOUT_AFTER_CREATE throws but the campaign was still created', async () => {
    const client = new FakeMetaClient({ scenarioFor: () => 'TIMEOUT_AFTER_CREATE' });

    await expect(
      client.createCampaign({ requestKey: 'req-3', name: 'Test Campaign' })
    ).rejects.toThrow(MetaTimeoutError);

    const found = await client.lookupByRequestKey('req-3');
    expect(found).toHaveLength(1);
    expect(found[0]!.requestKey).toBe('req-3');
  });
});
