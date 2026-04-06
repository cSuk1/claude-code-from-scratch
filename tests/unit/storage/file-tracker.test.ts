import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { initFileTracker, clearTracker, getTracker } from '../../../src/storage/file-tracker.js';

describe('File Change Tracker - Atomic Operations', () => {
  let testDir: string;
  let originalCwd: string;
  let sessionId: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(process.cwd(), 'test-tracker-' + randomUUID().slice(0, 8));
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    const ccminiDir = join(testDir, '.ccmini');
    mkdirSync(ccminiDir, { recursive: true });

    sessionId = randomUUID().slice(0, 8);
    clearTracker();
  });

  afterEach(() => {
    clearTracker();
    process.chdir(originalCwd);
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
    }
  });

  it('should track successful write_file operations', () => {
    const tracker = initFileTracker(sessionId);
    tracker.startTurn();

    const filePath = 'test.txt';
    const originalContent = '';
    const newContent = 'Hello World';

    tracker.recordChange(
      'write_file',
      filePath,
      originalContent,
      newContent,
      '',
      '',
      false
    );

    const turns = tracker.getTurns();
    expect(turns.length).toBe(1);
    expect(turns[0].changes.length).toBe(1);
    expect(turns[0].changes[0].file_path).toBe(filePath);
    expect(turns[0].changes[0].operation).toBe('write_file');
  });

  it('should track successful edit_file operations', () => {
    const tracker = initFileTracker(sessionId);
    tracker.startTurn();

    const filePath = 'test.txt';
    writeFileSync(filePath, 'Original content');

    tracker.recordChange(
      'edit_file',
      filePath,
      'Original content',
      'New content',
      'Original',
      'New',
      true
    );

    const turns = tracker.getTurns();
    expect(turns.length).toBe(1);
    expect(turns[0].changes.length).toBe(1);
    expect(turns[0].changes[0].file_path).toBe(filePath);
    expect(turns[0].changes[0].operation).toBe('edit_file');
  });

  it('should correctly revert a write_file operation that created a new file', () => {
    const tracker = initFileTracker(sessionId);
    tracker.startTurn();

    const filePath = 'test.txt';
    writeFileSync(filePath, 'Hello World');

    tracker.recordChange(
      'write_file',
      filePath,
      '',
      'Hello World',
      '',
      '',
      false
    );

    const result = tracker.revertLastTurn();
    expect(result.success).toBe(true);
    expect(result.reverted).toContain(filePath);
    expect(existsSync(filePath)).toBe(false);
  });

  it('should correctly revert a write_file operation that overwrote an existing file', () => {
    const tracker = initFileTracker(sessionId);
    tracker.startTurn();

    const filePath = 'test.txt';
    const originalContent = 'Original content';
    writeFileSync(filePath, originalContent);

    tracker.recordChange(
      'write_file',
      filePath,
      originalContent,
      'New content',
      '',
      '',
      true
    );

    writeFileSync(filePath, 'New content');

    const result = tracker.revertLastTurn();
    expect(result.success).toBe(true);
    expect(result.reverted).toContain(filePath);
    expect(readFileSync(filePath, 'utf-8')).toBe(originalContent);
  });

  it('should correctly revert an edit_file operation', () => {
    const tracker = initFileTracker(sessionId);
    tracker.startTurn();

    const filePath = 'test.txt';
    const originalContent = 'Hello old world';
    writeFileSync(filePath, originalContent);

    tracker.recordChange(
      'edit_file',
      filePath,
      originalContent,
      'Hello new world',
      'old',
      'new',
      true
    );

    writeFileSync(filePath, 'Hello new world');

    const result = tracker.revertLastTurn();
    expect(result.success).toBe(true);
    expect(result.reverted).toContain(filePath);
    expect(readFileSync(filePath, 'utf-8')).toBe(originalContent);
  });

  it('should decrement currentTurnId after successful revert', () => {
    const tracker = initFileTracker(sessionId);
    tracker.startTurn();

    const filePath = 'test.txt';
    tracker.recordChange(
      'write_file',
      filePath,
      '',
      'Hello',
      '',
      '',
      false
    );

    const beforeCount = tracker.getTurnCount();
    expect(beforeCount).toBe(1);

    tracker.revertLastTurn();

    const afterCount = tracker.getTurnCount();
    expect(afterCount).toBe(0);
  });

  it('should return error when reverting with no turns', () => {
    const tracker = initFileTracker(sessionId);
    const result = tracker.revertLastTurn();
    expect(result.success).toBe(false);
    expect(result.error).toContain('No turns to revert');
  });

  it('should return error when reverting a turn with no changes', () => {
    const tracker = initFileTracker(sessionId);
    tracker.startTurn();

    const result = tracker.revertLastTurn();
    expect(result.success).toBe(false);
    expect(result.error).toContain('No changes in last turn');
  });

  it('should handle multiple changes in one turn', () => {
    const tracker = initFileTracker(sessionId);
    tracker.startTurn();

    tracker.recordChange('write_file', 'file1.txt', '', 'Content 1', '', '', false);
    tracker.recordChange('write_file', 'file2.txt', '', 'Content 2', '', '', false);

    const turns = tracker.getTurns();
    expect(turns.length).toBe(1);
    expect(turns[0].changes.length).toBe(2);
  });

  it('should revert multiple changes in reverse order', () => {
    const tracker = initFileTracker(sessionId);
    tracker.startTurn();

    writeFileSync('file1.txt', 'Content 1');
    writeFileSync('file2.txt', 'Content 2');

    tracker.recordChange('write_file', 'file1.txt', '', 'Content 1', '', '', false);
    tracker.recordChange('write_file', 'file2.txt', '', 'Content 2', '', '', false);

    const result = tracker.revertLastTurn();
    expect(result.success).toBe(true);
    expect(result.reverted.length).toBe(2);
    expect(existsSync('file1.txt')).toBe(false);
    expect(existsSync('file2.txt')).toBe(false);
  });

  it('should clear tracker when clearTracker is called', () => {
    initFileTracker(sessionId);
    expect(getTracker()).not.toBeNull();

    clearTracker();
    expect(getTracker()).toBeNull();
  });

  it('should return most recent first from getTurns', () => {
    const tracker = initFileTracker(sessionId);

    tracker.startTurn();
    tracker.recordChange('write_file', 'file1.txt', '', 'C1', '', '', false);

    tracker.startTurn();
    tracker.recordChange('write_file', 'file2.txt', '', 'C2', '', '', false);

    const turns = tracker.getTurns();
    expect(turns[0].turnId).toBe(2);
    expect(turns[1].turnId).toBe(1);
  });
});
