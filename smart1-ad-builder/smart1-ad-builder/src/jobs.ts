/**
 * Job queue.
 *
 * In-memory for now, which is honest about what it is: fine for a single
 * instance, wrong the moment there are two. The plan calls for Render Key Value
 * as the queue, and this module is the seam where that swap happens — nothing
 * outside it knows how jobs are stored.
 *
 * Jobs do not survive a restart. On Render that matters, because a deploy
 * restarts the service, so anything in flight is lost. Persist to Render Key
 * Value or Postgres before this handles customer work.
 */

import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type { Campaign, RenderResult } from './types';
import { renderPackage } from './render';
import { CloudinaryService, slug, type UploadedAsset } from './cloudinary';
import { buildManifest, contextFor, tagsFor } from './manifest';
import { writeReports } from './report';
import { copyForSize } from './render';
import { getPlatform, getTemplate } from './registry';

export type JobStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  client: string;
  campaignName: string;
  platforms: string[];
  upload: boolean;
  progress: { done: number; total: number };
  results?: RenderResult[];
  reports?: string[];
  projectFolder?: string;
  error?: string;
}

interface JobInput {
  campaign: Campaign;
  platforms: string[];
  upload: boolean;
  outDir: string;
  assetRoot: string;
}

const jobs = new Map<string, Job>();
const inputs = new Map<string, JobInput>();
const queue: string[] = [];
let running = false;

export function enqueue(input: JobInput): Job {
  const id = randomUUID().slice(0, 8);
  const total = input.platforms.reduce((n, p) => {
    try {
      const cfg = getPlatform(p);
      return (
        n +
        input.campaign.concepts.reduce((m, c) => {
          try {
            const t = getTemplate(c.layoutFamily);
            return m + Object.keys(t.sizes).filter((s) => (cfg.sizes as any)[s]).length;
          } catch {
            return m;
          }
        }, 0)
      );
    } catch {
      return n;
    }
  }, 0);

  const job: Job = {
    id,
    status: 'queued',
    createdAt: new Date().toISOString(),
    client: input.campaign.brand.name,
    campaignName: input.campaign.campaignName,
    platforms: input.platforms,
    upload: input.upload,
    progress: { done: 0, total },
  };
  jobs.set(id, job);
  inputs.set(id, input);
  queue.push(id);
  return job;
}

export const getJob = (id: string): Job | undefined => jobs.get(id);
export const listJobs = (): Job[] => [...jobs.values()];

async function runJob(id: string): Promise<void> {
  const job = jobs.get(id)!;
  const input = inputs.get(id)!;
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  try {
    const { campaign, platforms, upload, outDir, assetRoot } = input;
    const cld = new CloudinaryService();
    const projectFolder = cld.projectFolder(campaign.brand.name, campaign.campaignName);
    job.projectFolder = projectFolder;

    const all: RenderResult[] = [];
    const uploads = new Map<string, UploadedAsset>();

    for (const platform of platforms) {
      for (const concept of campaign.concepts) {
        const results = await renderPackage({
          brand: campaign.brand,
          concept,
          platform,
          outDir,
          assetRoot,
        });
        all.push(...results);
        job.progress.done = all.length;
      }
    }

    if (upload) {
      cld.assertUsable();
      await cld.createProjectFolders(campaign.brand.name, campaign.campaignName);
      for (const r of all.filter((x) => x.status !== 'fail')) {
        const concept = campaign.concepts.find((c) => c.conceptId === r.conceptId)!;
        const asset = await cld.uploadCreative({
          file: r.file,
          folder: cld.finalFolder(campaign.brand.name, campaign.campaignName, r.platform, r.conceptId),
          publicId: `${slug(campaign.brand.domain)}_${r.conceptId}_${r.size}`,
          tags: tagsFor(campaign, r, concept.name),
          context: contextFor(campaign, r, copyForSize(concept, r.size).headline ?? ''),
        });
        uploads.set(r.file, asset);
      }
    }

    const manifest = buildManifest({
      campaign,
      projectFolder,
      results: all,
      uploads,
      dryRun: false,
      uploaded: upload,
    });
    const reports = writeReports(manifest, path.join(outDir, 'reports'));

    job.results = all;
    job.reports = reports.map((f) => `/files/${path.relative(outDir, f)}`);
    job.status = 'complete';
  } catch (err: any) {
    job.status = 'failed';
    job.error = err?.message ?? String(err);
    console.error(`[job ${id}] failed:`, err);
  } finally {
    job.finishedAt = new Date().toISOString();
    inputs.delete(id);
  }
}

/** Drain the queue one job at a time. Rendering is CPU-bound; parallelism here
 *  just makes every job slower and risks the memory limit on a small instance. */
export function startWorkerLoop(intervalMs = 500): void {
  setInterval(async () => {
    if (running || queue.length === 0) return;
    running = true;
    const id = queue.shift()!;
    try {
      await runJob(id);
    } finally {
      running = false;
    }
  }, intervalMs).unref();
}
