import { describe, it, expect } from 'vitest';

describe('Git Tool Definitions', () => {
  it('should have git tools in definitions', async () => {
    const { toolDefinitions } = await import('../src/tools/definitions.js');
    const gitTools = toolDefinitions.filter(t => t.name.startsWith('git_'));
    expect(gitTools.length).toBeGreaterThan(0);
  });

  it('should include all git tools', async () => {
    const { toolDefinitions } = await import('../src/tools/definitions.js');
    const names = toolDefinitions.map(t => t.name);
    expect(names).toContain('git_status');
    expect(names).toContain('git_diff');
    expect(names).toContain('git_diff_staged');
    expect(names).toContain('git_log');
    expect(names).toContain('git_show');
    expect(names).toContain('git_blame');
    expect(names).toContain('git_branch');
    expect(names).toContain('git_remote');
  });

  it('should have correct metadata for git tools', async () => {
    const { toolDefinitions } = await import('../src/tools/definitions.js');
    const gitTools = toolDefinitions.filter(t => t.name.startsWith('git_'));

    for (const tool of gitTools) {
      expect(tool.metadata.category).toBe('read');
      expect(tool.metadata.parallelSafe).toBe(true);
      expect(tool.metadata.idempotent).toBe(true);
    }
  });
});

describe('Git Handlers Registration', () => {
  it('should have git handlers registered', async () => {
    const { handlers } = await import('../src/tools/executors/index.js');

    expect(typeof handlers.git_status).toBe('function');
    expect(typeof handlers.git_diff).toBe('function');
    expect(typeof handlers.git_diff_staged).toBe('function');
    expect(typeof handlers.git_log).toBe('function');
    expect(typeof handlers.git_show).toBe('function');
    expect(typeof handlers.git_blame).toBe('function');
    expect(typeof handlers.git_branch).toBe('function');
    expect(typeof handlers.git_remote).toBe('function');
  });
});