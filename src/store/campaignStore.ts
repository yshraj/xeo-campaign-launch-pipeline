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

  /**
   * Atomically transition a campaign from `fromStatus` to `toStatus`, but only
   * if it is currently in `fromStatus`. Returns true if THIS caller won the
   * transition, false otherwise.
   *
   * This is the concurrency primitive the worker relies on. The whole
   * read-modify-write runs synchronously with no `await` in the middle, so on
   * single-threaded Node it is genuinely atomic: of N workers racing to claim
   * the same campaign, exactly one sees `fromStatus` and flips it; the rest
   * observe the already-changed status and get false.
   */
  compareAndSetStatus(
    id: string,
    fromStatus: CampaignStatus,
    toStatus: CampaignStatus
  ): boolean {
    const existing = this.campaigns.get(id);
    if (!existing || existing.status !== fromStatus) {
      return false;
    }
    this.campaigns.set(id, {
      ...existing,
      status: toStatus,
      updatedAt: Date.now(),
    });
    return true;
  }
}
