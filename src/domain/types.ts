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
  // When a worker claims a campaign (IN_PROGRESS) it holds a time-bounded
  // lease. If the worker crashes without finishing, the lease expires and
  // another worker is allowed to reclaim the campaign. Unset when no worker
  // holds the claim.
  leaseExpiresAt?: number;
}

export interface LaunchJob {
  campaignId: string;
  requestKey: string;
}
