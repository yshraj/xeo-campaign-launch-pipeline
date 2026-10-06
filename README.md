# XEO Founding Engineer Exercise — Campaign Launch Reliability

## Scenario

This is a small, simplified model of a campaign execution pipeline: a `CampaignService` accepts a request to launch a campaign, queues a job, and a `LaunchWorker` asks an external ad platform (`FakeMetaClient`, a deterministic stand-in with no real network calls) to create the campaign. On success, the campaign is marked `ACTIVE` with the platform's `externalId`.

The happy path already works:

```
DRAFT --request launch--> LAUNCHING --job queued--> worker processes --> FakeMetaClient.createCampaign() --> ACTIVE + externalId
```

This implementation has not been hardened for production, though. A few things are true of the environment this code actually has to run in:

- Job queues occasionally deliver the same logical job more than once.
- More than one worker process can end up handling the same operation at the same time.
- A request to the external platform can time out before the platform has done anything.
- A request to the external platform can also time out *after* the platform has already created the campaign — the side effect happened, but the caller never found out. `FakeMetaClient` models this faithfully: on a timeout, the campaign may or may not already exist externally, and nothing in its response tells you which. It also does not protect you from creating a campaign twice if you ask it to — there is no built-in deduplication.
- A worker process can be interrupted (crash, redeploy, restart) between an external call completing and the result being saved locally.

Your task is to harden the launch workflow against these realities.

## Setup

```
npm install
npm test
```

## Running tests

- `npm test` — runs the full test suite once (non-watch).
- `npm run test:watch` — watch mode, useful while iterating.
- `npm run typecheck` — runs `tsc --noEmit`.

The included tests (`test/happyPath.test.ts`, `test/fakeMetaClient.test.ts`) all pass against the current code and should keep passing after your changes.

## Duration

This exercise is time-boxed to approximately **90–120 minutes**. It is intentionally not a from-scratch build — you're hardening a small, working system, not designing one from nothing.

Correctness on the most important failure modes matters more than covering all of them. In rough priority order:

1. Duplicate delivery of the same launch job must not result in duplicate campaigns on the external platform.
2. Two workers processing the same operation at the same time must not produce an incorrect or inconsistent result.
3. The ambiguous "timeout after the external side effect happened" case must be handled safely — in particular, it must not be treated the same as "nothing happened, safe to retry."

Beyond that, further improvements to recovery, retry safety, and auditability are valuable but not required for a complete submission. If you run out of time, a short written note on what you'd still want to address and why is a perfectly acceptable substitute for more code.

We are not expecting production infrastructure here — no real queue, no database, no distributed locking service. Solve this with what's in the repo. Please don't rewrite the system from scratch; targeted, well-reasoned changes are what we're evaluating.

## Assignment

Harden `src/service/campaignService.ts` and `src/worker/launchWorker.ts` (and anything else you think needs to change) so the launch workflow behaves correctly under the conditions described above. You're free to:

- Change the data model (`src/domain/types.ts`) if you think the current one can't represent what actually happens in production.
- Add new files, types, or helper modules.
- Extend `CampaignStore` if you need a different way to read or write campaign state.

Please don't change the public behavior of `FakeMetaClient` or `InMemoryQueue` — treat them as fixed infrastructure, the same way you'd treat a third-party SDK and an existing message queue.

Add your own tests demonstrating that the failure modes above are actually handled. Keep tests deterministic — no reliance on real timers, sleeps, or randomness for correctness.

## Constraints

- No new runtime dependencies beyond what's already in `package.json`.
- No real network calls, no database, no Docker, no external services.
- In-memory state only.
- Everything should run via `npm test` with no manual setup steps beyond `npm install`.

## Submission expectations

- Your code changes.
- Your own tests covering the failure modes you addressed.
- A short written note (in this README or a separate file) describing what you changed, why, and any known gaps or trade-offs — especially anything you'd do differently with more time.

We're less interested in a single "correct answer" than in how you reason about the ambiguity here and what trade-offs you make under a real time constraint.
