import { randomUUID } from 'node:crypto';
import type { Campaign, CampaignStatus } from '../domain/types.js';

export class CampaignStore {
  private campaigns = new Map<string, Campaign>();

  create(name: string): Campaign {
    const campaign: Campaign = {
      id: randomUUID(),
      name,
      status: 'DRAFT',
      updatedAt: Date.now(),
    };
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  get(id: string): Campaign | undefined {
    return this.campaigns.get(id);
  }

  list(): Campaign[] {
    return [...this.campaigns.values()];
  }

  update(id: string, patch: Partial<Omit<Campaign, 'id'>>): Campaign {
    const existing = this.campaigns.get(id);
    if (!existing) {
      throw new Error(`Campaign not found: ${id}`);
    }
    const updated: Campaign = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    };
    this.campaigns.set(id, updated);
    return updated;
  }

  setStatus(id: string, status: CampaignStatus): Campaign {
    return this.update(id, { status });
  }
}
