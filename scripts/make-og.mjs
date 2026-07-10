// Renders the 1200x630 OG image from an inline SVG using sharp
// (already a transitive dependency via Astro). Run: node scripts/make-og.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#F5F5F0"/>
  <rect x="0" y="0" width="1200" height="6" fill="#D4AF37"/>
  <text x="80" y="140" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" letter-spacing="4" fill="#6B6259">VIRAT MOHAN</text>
  <text x="72" y="330" font-family="Georgia, 'Times New Roman', serif" font-size="150" fill="#1A1410">Virat Mohan</text>
  <text x="80" y="430" font-family="Georgia, 'Times New Roman', serif" font-size="46" fill="#6B6259">The operating layer between</text>
  <text x="80" y="490" font-family="Georgia, 'Times New Roman', serif" font-size="46" fill="#6B6259">capital and execution.</text>
  <rect x="80" y="548" width="120" height="2" fill="#D4AF37"/>
</svg>`;

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'og.png'
);

await sharp(Buffer.from(svg)).png().toFile(out);
console.log('wrote', out);
