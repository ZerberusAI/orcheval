import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cpus, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TargetMetadata, WorkloadDefinition } from './index.ts';

export interface FrameworkIdentity {
  version: string;
  gitCommit: string | null;
  gitDirty: boolean | null;
}

export interface ReproductionManifest {
  framework: FrameworkIdentity;
  profile: { id: string; version: string; scenarios: WorkloadDefinition[] };
  gates: { id: string; version: string | null; mandatory: boolean }[];
  metrics: { id: string; version: string | null }[];
  targets: {
    id: string;
    version: string;
    mode: TargetMetadata['mode'];
    adapterVersion: string | null;
    sdkVersions: Record<string, string> | null;
    containerImageDigests: string[] | null;
  }[];
}

/** Sort object keys recursively while preserving execution/list order. */
export function contentHash(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
    }
    return entry;
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function captureFrameworkIdentity(): FrameworkIdentity {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
  const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], {
    encoding: 'utf8', timeout: 2_000, stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  try {
    // An installed package must not inherit the consuming application's Git identity.
    if (resolve(git('rev-parse', '--show-toplevel')) !== resolve(root)) return { version, gitCommit: null, gitDirty: null };
    return { version, gitCommit: git('rev-parse', 'HEAD'), gitDirty: git('status', '--porcelain', '--untracked-files=normal').length > 0 };
  } catch {
    return { version, gitCommit: null, gitDirty: null };
  }
}

export function captureHostEnvironment() {
  const processors = cpus();
  return {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    osRelease: release(),
    cpuModel: processors[0]?.model ?? null,
    cpuCount: processors.length,
    ramBytes: totalmem(),
    dockerVersion: null,
  };
}
