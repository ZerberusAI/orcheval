import { readFile } from 'node:fs/promises';

export async function requestFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function http(base, path, { token, body, method = body === undefined ? 'GET' : 'POST', timeoutMs = 5_000 } = {}) {
  const response = await fetch(new URL(path, base), {
    method, signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Do not include response bodies: authentication errors can contain credentials.
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]} returned HTTP ${response.status}.`);
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export async function sdkVersion(packageName) {
  return JSON.parse(await readFile(new URL(`../node_modules/${packageName}/package.json`, import.meta.url), 'utf8')).version;
}

export function sdkDigest() {
  const id = process.env.ORCHEVAL_SDK_IMAGE_ID;
  if (!/^sha256:[a-f0-9]{64}$/.test(id ?? '')) throw new Error('Supply the exact SDK image id using the provider lab helper.');
  return `orcheval-connectors-sdk@${id}`;
}

export async function respond(operation) {
  try { process.stdout.write(JSON.stringify(await operation())); }
  catch (error) {
    // SDK errors may carry HTTP request objects with Authorization headers.
    // Emit the bounded message only, never inspect the whole error object.
    let message = error instanceof Error ? error.message : 'Connector request failed.';
    for (const value of [process.env.TRIGGER_SECRET_KEY, process.env.HATCHET_CLIENT_TOKEN]) {
      if (value) message = message.replaceAll(value, '[redacted]');
    }
    process.stderr.write(`${message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 2_000)}\n`);
    process.exitCode = 1;
  }
}
