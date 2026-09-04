// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
// output stays 'static' (default): every existing page still prerenders to
// static HTML exactly as before. Only routes under src/pages/devshop/api and
// src/pages/devshop/admin opt into on-demand rendering via
// `export const prerender = false`, which is what needs the adapter below.
export default defineConfig({
  site: 'https://viratmohan.com',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  adapter: cloudflare({ imageService: 'compile' }),
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
