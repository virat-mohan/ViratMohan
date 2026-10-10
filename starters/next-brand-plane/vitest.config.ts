import { defineConfig } from 'vitest/config';
import path from 'path';

const pkg = path.resolve(__dirname, '../../../retail-os-brand-config');

export default defineConfig({
  resolve: {
    alias: {
      '@retail-os/brand-config/brand-identity': path.join(pkg, 'brand-identity.ts'),
      '@retail-os/brand-config/brand-config': path.join(pkg, 'brand-config.ts'),
      '@retail-os/brand-config/modules': path.join(pkg, 'modules.ts'),
      '@retail-os/brand-config/module-status': path.join(pkg, 'module-status.ts'),
      '@retail-os/brand-config/navigation': path.join(pkg, 'navigation.ts'),
      '@retail-os/brand-config/dashboard-sections': path.join(pkg, 'dashboard-sections.ts'),
      '@retail-os/brand-config/render-contract': path.join(pkg, 'render-contract.ts'),
      '@retail-os/brand-config': path.join(pkg, 'index.ts'),
      '@': path.resolve(__dirname),
    },
  },
  test: {
    include: ['**/*.test.ts'],
  },
});
