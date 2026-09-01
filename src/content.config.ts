import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    standfirst: z.string(),
    order: z.number(),
    pubDate: z.coerce.date(),
  }),
});

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: ({ image }) =>
    z.object({
      // category is the primary "product" headline (e.g. "E-Commerce
      // Infrastructure"); brand is the real client proving it works.
      category: z.string(),
      brand: z.string(),
      tagline: z.string(),
      domain: z.string().url(),
      order: z.number(),
      // a real colour pulled from the brand's own live site, used as a
      // small accent — falls back to an initials badge when there's no
      // logo image (e.g. a client-rendered SPA with no fetchable asset).
      accent: z.string(),
      logo: image().optional(),
      // for brands whose real mark is a wordmark (no fetchable logo
      // image) — recreated as real text, e.g. "by Vijit Veer Hooda".
      founder: z.string().optional(),
    }),
});

export const collections = { writing, work };
