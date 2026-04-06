import { describe, it, expect } from 'vitest';

describe('File Change Tracker Integration', () => {
  it('should export FileChangeTracker class', async () => {
    const { FileChangeTracker } = await import('../src/storage/file-tracker.js');
    expect(typeof FileChangeTracker).toBe('function');
  });

  it('should export tracker functions', async () => {
    const { getFileTracker, initFileTracker, getTracker } = await import('../src/storage/file-tracker.js');
    expect(typeof getFileTracker).toBe('function');
    expect(typeof initFileTracker).toBe('function');
    expect(typeof getTracker).toBe('function');
  });
});

describe('Agent File Tracking Methods', () => {
  it('should have getFileChangeTrace method', async () => {
    const { Agent } = await import('../src/core/agent.js');
    expect(typeof Agent.prototype.getFileChangeTrace).toBe('function');
  });

  it('should have revertLastTurn method', async () => {
    const { Agent } = await import('../src/core/agent.js');
    expect(typeof Agent.prototype.revertLastTurn).toBe('function');
  });
});

describe('REPL Commands', () => {
  it('should have /trace command registered', async () => {
    const { CommandRegistry, registerBuiltinCommands } = await import('../src/cli/commands.js');
    const registry = new CommandRegistry();
    registerBuiltinCommands(registry);

    const traceCmd = registry.get('trace');
    expect(traceCmd).toBeDefined();
    expect(traceCmd?.name).toBe('trace');
    expect(traceCmd?.usage).toBe('/trace');
  });

  it('should have /revert command registered', async () => {
    const { CommandRegistry, registerBuiltinCommands } = await import('../src/cli/commands.js');
    const registry = new CommandRegistry();
    registerBuiltinCommands(registry);

    const revertCmd = registry.get('revert');
    expect(revertCmd).toBeDefined();
    expect(revertCmd?.name).toBe('revert');
    expect(revertCmd?.usage).toBe('/revert');
  });
});