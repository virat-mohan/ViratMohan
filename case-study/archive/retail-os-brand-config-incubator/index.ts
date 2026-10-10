// Retail OS — canonical brand-configuration layer (public surface).
// Framework-agnostic. Stores import from here; secrets never live here.
export * from './types';
export * from './modules';
export * from './navigation';
export * from './defaults';
export * from './config';
export * from './render-contract';
// Store-plane brand IDENTITY contract (consumed by the live stores).
export * from './brand-identity';

export { moonglasses } from './brands/moonglasses';
export { travaholic } from './brands/travaholic';
export { ceremony } from './brands/ceremony';
export { exampleNewBrand } from './brands/example-new-brand';
