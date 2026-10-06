import { readFile } from 'node:fs/promises';
import { HatchetClient } from '@hatchet-dev/typescript-sdk/v1';

export async function createHatchetClient() {
  const token = process.env.HATCHET_CLIENT_TOKEN ?? (await readFile('/state/hatchet-token', 'utf8')).trim();
  return HatchetClient.init({ token, log_level: 'OFF' }, undefined, { timeout: 5_000 });
}
