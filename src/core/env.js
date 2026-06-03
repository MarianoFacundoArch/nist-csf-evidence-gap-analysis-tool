/**
 * Tiny .env loader (no `dotenv` dependency).
 *
 * The .env file carries ONLY secrets and endpoints (API keys, Ollama host).
 * We load them into process.env so the provider modules can read them in the
 * usual way. We never let .env override behavioral config, and we never put
 * secrets into any persisted config snapshot.
 *
 * Existing process.env values win (so `OPENAI_API_KEY=… csf-tool …` on the
 * command line is respected over a .env file).
 */

import { readFile } from 'node:fs/promises';
import { fileExists } from '../util/fsx.js';

const LINE = /^\s*([\w.-]+)\s*=\s*(.*)\s*$/;

/** Load `.env` (if present) into process.env without overriding existing vars. */
export async function loadEnv(path = '.env') {
  if (!(await fileExists(path))) return;
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return; // unreadable .env is non-fatal — providers will just report missing keys
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    // Strip optional surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
