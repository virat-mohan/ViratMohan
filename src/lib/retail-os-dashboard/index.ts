// Retail OS Dashboard — control-plane view-model layer.
//
// AUTHORITY: The canonical dashboard/navigation contract lives in
// @retail-os/brand-config (dashboard-sections.ts). This module provides
// control-plane-specific types used by the Astro Founder Console.
// The brand-plane (Next.js) consumes @retail-os/brand-config directly.

export * from './types';
export * from './navigation';
export * from './command-centre';
