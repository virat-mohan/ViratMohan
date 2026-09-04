// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
// output stays 'static' (default): every existing page still prerenders to
// static HTML exactly as before. Only routes under src/pages/devshop/api and
// src/pages/devshop/admin opt into on-demand rendering via
// `export const prerender = false`, which is what needs the adapter below —
// those run as Vercel Functions; env vars come from Vercel's project
// settings (Settings > Environment Variables), read via import.meta.env.
export default defineConfig({
  site: 'https://viratmohan.com',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
