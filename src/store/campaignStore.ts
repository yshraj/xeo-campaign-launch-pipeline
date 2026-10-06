import { randomUUID } from 'node:crypto';
import type { Campaign, CampaignStatus } from '../domain/types.js';

export class CampaignStore {
  private campaigns = new Map<string, Campaign>();
  private now: () => number;

  /**
   * `now` is injectable so lease expiry is testable without real timers or
   * sleeps. Defaults to the wall clock in production.
   */
  constructor(opts?: { now?: () => number }) {
    this.now = opts?.now ?? Date.now;
  }

  create(name: string): Campaign {
    const campaign: Campaign = {
      id: randomUUID(),
      name,
      status: 'DRAFT',
      updatedAt: this.now(),
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
      updatedAt: this.now(),
    };
    this.campaigns.set(id, updated);
    return updated;
  }

  setStatus(id: string, status: CampaignStatus): Campaign {
    return this.update(id, { status });
  }

  /**
   * Atomically try to claim a campaign for launch, taking out a time-bounded
   * lease. Returns true if THIS caller won the claim.
   *
   * A claim is granted when the campaign is either:
   *  - LAUNCHING (nobody holds it yet), or
   *  - IN_PROGRESS but its lease has expired (the previous holder is presumed
   *    dead — crashed, redeployed, or restarted mid-flight).
   *
   * On success the campaign moves to IN_PROGRESS with a fresh lease. The whole
   * read-modify-write runs synchronously with no `await` in the middle, so on
   * single-threaded Node it is genuinely atomic: of N workers racing on the
   * same campaign, exactly one wins and the rest get false. The expired-lease
   * branch is what lets a healthy worker recover a campaign stranded by a
   * crashed one, instead of it being stuck in IN_PROGRESS forever.
   */
  claimForLaunch(id: string, leaseMs: number): boolean {
    const existing = this.campaigns.get(id);
    if (!existing) {
      return false;
    }

    const now = this.now();
    const isUnclaimed = existing.status === 'LAUNCHING';
    const isExpiredClaim =
      existing.status === 'IN_PROGRESS' &&
      existing.leaseExpiresAt !== undefined &&
      existing.leaseExpiresAt <= now;

    if (!isUnclaimed && !isExpiredClaim) {
      return false;
    }

    this.campaigns.set(id, {
      ...existing,
      status: 'IN_PROGRESS',
      leaseExpiresAt: now + leaseMs,
      updatedAt: now,
    });
    return true;
  }
}
