// Dashboard configuration: resolves the brand config into the canonical
// 11-section dashboard navigation. Deterministic, no API calls.

import { defineBrand } from '@retail-os/brand-config/brand-config';
import { resolveModuleStatus, type SetupProbe } from '@retail-os/brand-config/module-status';
import {
  buildDashboardSections, visibleDashboardSections,
  type DashboardSectionView,
} from '@retail-os/brand-config/dashboard-sections';
import { buildHeaderModel, type HeaderModel } from '@retail-os/brand-config/render-contract';
import { brandConfigInput } from './brand';

const config = defineBrand(brandConfigInput);

const probe: SetupProbe = {
  hasSetting: (key: string) => {
    if (typeof process !== 'undefined' && process.env) {
      return !!process.env[key];
    }
    return false;
  },
};

export function getDashboardSections(): DashboardSectionView[] {
  const statuses = resolveModuleStatus(config, probe);
  return buildDashboardSections(config, statuses);
}

export function getVisibleSections(): DashboardSectionView[] {
  const statuses = resolveModuleStatus(config, probe);
  return visibleDashboardSections(config, statuses);
}

export function getHeader(): HeaderModel {
  return buildHeaderModel(config);
}

export { config };
