import { resourceUsage, memoryUsage } from 'node:process';

export interface ProcessResourceSample { scope: 'ORCHEVAL_PROCESS_SHARED'; capturedAt: string; cpuUserMicros: number; cpuSystemMicros: number; maxRssBytes: number; rssBytes: number; heapUsedBytes: number; }

export function captureProcessResources(): ProcessResourceSample {
  const usage = resourceUsage();
  const memory = memoryUsage();
  return { scope: 'ORCHEVAL_PROCESS_SHARED', capturedAt: new Date().toISOString(), cpuUserMicros: usage.userCPUTime, cpuSystemMicros: usage.systemCPUTime, maxRssBytes: usage.maxRSS * 1024, rssBytes: memory.rss, heapUsedBytes: memory.heapUsed };
}

export function resourceDelta(start: ProcessResourceSample, end: ProcessResourceSample): ProcessResourceSample {
  return { scope: 'ORCHEVAL_PROCESS_SHARED', capturedAt: end.capturedAt, cpuUserMicros: Math.max(0, end.cpuUserMicros - start.cpuUserMicros), cpuSystemMicros: Math.max(0, end.cpuSystemMicros - start.cpuSystemMicros), maxRssBytes: end.maxRssBytes, rssBytes: end.rssBytes, heapUsedBytes: end.heapUsedBytes };
}
