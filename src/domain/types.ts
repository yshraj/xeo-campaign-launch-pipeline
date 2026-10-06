export type CampaignStatus = 'DRAFT' | 'LAUNCHING' | 'ACTIVE' | 'FAILED';

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
