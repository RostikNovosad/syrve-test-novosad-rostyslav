import type { Config } from '../config.js';
import { RealSyrveClient } from './real.js';
import { TokenProvider } from './token.js';
import type { SyrveClient } from './types.js';

export function createSyrveClient(config: Config): SyrveClient {
  const tokens = new TokenProvider({ apiUrl: config.SYRVE_API_URL, apiLogin: config.SYRVE_API_LOGIN });
  return new RealSyrveClient({ apiUrl: config.SYRVE_API_URL, tokens });
}

/**
 * О1: знаходить організацію й активну програму лояльності.
 * Коли організація одна — беремо її; інакше потрібно явно задати (поки — перша).
 */
export async function discoverSyrve(client: SyrveClient) {
  const [organization] = await client.getOrganizations();
  if (!organization) throw new Error('Syrve: не знайдено жодної організації');
  const programs = await client.getPrograms(organization.id);
  const program = programs.find((p) => p.isActive) ?? programs[0];
  if (!program) throw new Error(`Syrve: у організації "${organization.name}" немає програм лояльності`);
  return { organization, program };
}

export interface SyrveContext {
  organizationId: string;
  programId: string;
  walletId?: string;
}

/** Організація й програма, знайдені один раз і закешовані (помилку не кешуємо). */
export function createSyrveContext(client: SyrveClient): () => Promise<SyrveContext> {
  let cached: Promise<SyrveContext> | undefined;
  return () =>
    (cached ??= discoverSyrve(client)
      .then((d) => ({ organizationId: d.organization.id, programId: d.program.id, walletId: d.program.walletId }))
      .catch((e) => {
        cached = undefined;
        throw e;
      }));
}

export * from './types.js';
