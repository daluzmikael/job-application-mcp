import { promises as fs } from "node:fs";
import { COMPANY_CACHE_PATH } from "./paths.js";
import { AtsPlatform } from "./ats-clients.js";

export interface CachedCompany {
  company: string;
  platform: AtsPlatform;
  token: string;
  last_searched: string;
}

export async function readCompanyCache(): Promise<CachedCompany[]> {
  try {
    const raw = await fs.readFile(COMPANY_CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function upsertCompanyCache(entry: CachedCompany): Promise<void> {
  const cache = await readCompanyCache();
  const idx = cache.findIndex(
    (c) => c.company.toLowerCase() === entry.company.toLowerCase()
  );
  if (idx >= 0) cache[idx] = entry;
  else cache.push(entry);
  await fs.writeFile(COMPANY_CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}
