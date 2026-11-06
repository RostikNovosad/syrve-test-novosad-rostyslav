import type { Config } from '../config.js';
import { MockSyrveClient } from './mock.js';
import { RealSyrveClient } from './real.js';
import { TokenProvider } from './token.js';
import type { SyrveClient } from './types.js';

export function createSyrveClient(config: Config): SyrveClient {
  if (config.SYRVE_MODE === 'mock') return new MockSyrveClient();
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

export * from './types.js';
