import { randomUUID } from 'node:crypto';

export type MetaScenario = 'SUCCESS' | 'TIMEOUT_BEFORE_CREATE' | 'TIMEOUT_AFTER_CREATE';

export interface CreateCampaignRequest {
  requestKey: string;
  name: string;
}

export interface CreateCampaignResult {
  externalId: string;
  name: string;
}

export interface ExternalCampaignRecord {
  externalId: string;
  requestKey: string;
  name: string;
  createdAt: number;
}

export class MetaTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaTimeoutError';
  }
}

export type ScenarioResolver = (request: CreateCampaignRequest) => MetaScenario;

/**
 * A deterministic stand-in for an external ad-platform API.
 *
 * Behavior for a given call is controlled entirely by the injected
 * `scenarioFor` resolver, so there is no randomness and no real network
 * or timers involved. Tests using this client are fully reproducible.
 */
export class FakeMetaClient {
  private records: ExternalCampaignRecord[] = [];
  private scenarioFor: ScenarioResolver;

  constructor(opts?: { scenarioFor?: ScenarioResolver }) {
    this.scenarioFor = opts?.scenarioFor ?? (() => 'SUCCESS');
  }

  async createCampaign(request: CreateCampaignRequest): Promise<CreateCampaignResult> {
    const scenario = this.scenarioFor(request);

    if (scenario === 'TIMEOUT_BEFORE_CREATE') {
      await Promise.resolve();
      throw new MetaTimeoutError(
        `Timed out before creating campaign for requestKey=${request.requestKey}`
      );
    }

    // The platform creates the campaign regardless of whether the
    // caller ever finds out about it.
    const record: ExternalCampaignRecord = {
      externalId: randomUUID(),
      requestKey: request.requestKey,
      name: request.name,
      createdAt: Date.now(),
    };
    this.records.push(record);

    if (scenario === 'TIMEOUT_AFTER_CREATE') {
      await Promise.resolve();
      throw new MetaTimeoutError(
        `Timed out after creating campaign for requestKey=${request.requestKey}`
      );
    }

    await Promise.resolve();
    return { externalId: record.externalId, name: record.name };
  }

  async lookupByRequestKey(requestKey: string): Promise<ExternalCampaignRecord[]> {
    await Promise.resolve();
    return this.records.filter((r) => r.requestKey === requestKey);
  }
}
