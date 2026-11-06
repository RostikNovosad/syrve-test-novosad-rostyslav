import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('вимагає apiLogin', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x' })).toThrow(/SYRVE_API_LOGIN/);
  });
  it('приймає коректну конфігурацію', () => {
    expect(loadConfig({ DATABASE_URL: 'x', SYRVE_API_LOGIN: 'k' }).SYRVE_API_LOGIN).toBe('k');
  });
});
