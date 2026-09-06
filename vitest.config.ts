import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Agent worktrees live under .claude/worktrees/ inside this repo's own
    // directory tree (see the DevShop vertical-builder agents) — without this
    // exclude, vitest's default file discovery picks up each worktree's own
    // copy of tests/unit too, silently multiplying the reported test count.
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**', '**/dist/**'],
  },
});
