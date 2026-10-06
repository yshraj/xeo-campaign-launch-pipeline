export type CampaignStatus =
  | 'DRAFT'
  | 'LAUNCHING'
  // A worker has atomically claimed this campaign and is mid-flight talking to
  // the external platform. Only one worker can hold this claim at a time.
  | 'IN_PROGRESS'
  | 'ACTIVE'
  | 'FAILED';

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  externalId?: string;
  updatedAt: number;
}

export interface LaunchJob {
  campaignId: string;
  requestKey: string;
}
