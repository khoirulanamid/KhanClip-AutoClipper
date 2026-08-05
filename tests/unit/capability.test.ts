import { describe, it, expect } from 'vitest';
import { checkSystemCapability } from '@/infrastructure/media/webcodecs/capability';

describe('System Capability Checker', () => {
  it('runs capability check without throwing', async () => {
    const report = await checkSystemCapability();
    expect(report).toBeDefined();
    expect(report.overallStatus).toBeDefined();
    expect(['ready', 'ready_fallback', 'unsupported']).toContain(report.overallStatus);
  });
});
