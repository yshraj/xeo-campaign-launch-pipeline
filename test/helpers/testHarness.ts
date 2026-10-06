import { CampaignStore } from '../../src/store/campaignStore.js';
import { InMemoryQueue } from '../../src/queue/inMemoryQueue.js';
import { FakeMetaClient, type ScenarioResolver } from '../../src/external/fakeMetaClient.js';
import { CampaignService } from '../../src/service/campaignService.js';
import { LaunchWorker } from '../../src/worker/launchWorker.js';
import type { LaunchJob } from '../../src/domain/types.js';

export interface Harness {
  store: CampaignStore;
  queue: InMemoryQueue<LaunchJob>;
  metaClient: FakeMetaClient;
  service: CampaignService;
  worker: LaunchWorker;
}

export function buildHarness(scenarioFor?: ScenarioResolver): Harness {
  const store = new CampaignStore();
  const queue = new InMemoryQueue<LaunchJob>();
  const metaClient = new FakeMetaClient({ scenarioFor });
  const service = new CampaignService(store, queue);
  const worker = new LaunchWorker(queue, store, metaClient);

  return { store, queue, metaClient, service, worker };
}
