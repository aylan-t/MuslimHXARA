import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_URL,
  DEFAULT_OPTIONS,
  loadExtensionOptions,
  saveExtensionOptions,
} from '../src/options';

describe('extension app URL', () => {
  it('uses the Replit URL instead of localhost by default', () => {
    expect(DEFAULT_OPTIONS.baseUrl).toBe(DEFAULT_APP_URL);
    expect(DEFAULT_APP_URL).toMatch(/^https:\/\/.+\.replit\.dev$/);
  });

  it('migrates an existing localhost preference to Replit', async () => {
    await saveExtensionOptions({
      ...DEFAULT_OPTIONS,
      baseUrl: 'http://localhost:3000',
    });

    const loaded = await loadExtensionOptions();

    expect(loaded.baseUrl).toBe(DEFAULT_APP_URL);
  });
});