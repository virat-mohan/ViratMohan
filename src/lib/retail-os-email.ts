import { escapeHtml } from './retail-os-http';
import { signatureHtml } from './mail/links';

// The one layout every Retail OS email uses, in the viratmohan.com Retail OS
// look (cream, ink, the four-colour stripe, Anton headings). Rule: every email
// is brief and ends in exactly one next step (cta). Only FYIs and scheduled
// reports may go without one.
export type RetailOsEmail = {
  preheader: string; // inbox preview line
  eyebrow?: string;
  heading: string;
  lines: string[]; // plain text, one short paragraph each
  rows?: { label: string; value: string }[];
  cta?: { label: string; url: string };
  secondary?: { label: string; url: string }; // quiet text link under the button
  note?: string; // small print under the button
  bodyHtml?: string; // pre-rendered, already-escaped HTML (reports only)
};

const FONT = "Arial, Helvetica, sans-serif";
export const LOGO_URL = 'https://www.viratmohan.com/retail-os/email/devshop-logo.png';

// Every email carries the one canonical signature (mail/links.ts); the address comes from GMAIL_ADDRESS.
export const SIGNATURE_HTML = signatureHtml(process.env.GMAIL_ADDRESS || 'viratmohan@gmail.com');
const DISPLAY = "Anton, Impact, 'Arial Narrow', Arial, sans-serif";

export function renderRetailOsEmail(e: RetailOsEmail): string {
  const lines = e.lines
    .map((l) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:15px;line-height:1.55;color:#4A4038;">${escapeHtml(l)}</p>`)
    .join('');
  const rows = e.rows?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:6px 0 16px;">${e.rows
        .map((r) => `<tr><td style="padding:8px 10px 8px 0;border-top:1px solid #D9CDB4;font-family:${FONT};font-size:13px;font-weight:bold;color:#1A1410;vertical-align:top;width:34%;">${escapeHtml(r.label)}</td><td style="padding:8px 0;border-top:1px solid #D9CDB4;font-family:${FONT};font-size:13px;color:#4A4038;vertical-align:top;">${escapeHtml(r.value)}</td></tr>`)
        .join('')}</table>`
    : '';
  const cta = e.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td bgcolor="#1A1410" style="background:#1A1410;"><a href="${escapeHtml(e.cta.url)}" style="display:inline-block;padding:14px 22px;font-family:${FONT};font-size:15px;font-weight:bold;color:#F4EAD4;text-decoration:none;">${escapeHtml(e.cta.label)} &rarr;</a></td></tr></table>`
    : '';
  const secondary = e.secondary ? `<p style="margin:12px 0 0;font-family:${FONT};font-size:14px;"><a href="${escapeHtml(e.secondary.url)}" style="color:#1A1410;">${escapeHtml(e.secondary.label)}</a></p>` : '';
  const note = e.note ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#7A6E62;">${escapeHtml(e.note)}</p>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#F4EAD4;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(e.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F4EAD4" style="background:#F4EAD4;">
<tr><td align="center" style="padding:0 12px 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
    <tr><td style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td height="6" bgcolor="#D4AF37" style="background:#D4AF37;font-size:0;line-height:0;">&nbsp;</td>
        <td height="6" bgcolor="#3E6FA6" style="background:#3E6FA6;font-size:0;line-height:0;">&nbsp;</td>
        <td height="6" bgcolor="#E91E8C" style="background:#E91E8C;font-size:0;line-height:0;">&nbsp;</td>
        <td height="6" bgcolor="#9C7A4A" style="background:#9C7A4A;font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:20px 0 14px;">
      <img src="${LOGO_URL}" width="180" height="69" alt="DevShop" style="display:block;border:0;width:180px;height:auto;">
      <span style="font-family:${FONT};font-size:12px;font-style:italic;font-weight:bold;color:#4A4038;">Retail OS&trade;</span>
    </td></tr>
    <tr><td style="border:2px solid #1A1410;background:#FBF6EA;padding:26px 24px 24px;">
      ${e.eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#D9714B;">${escapeHtml(e.eyebrow)}</p>` : ''}
      <h1 style="margin:0 0 14px;font-family:${DISPLAY};font-weight:normal;font-size:28px;line-height:1.1;text-transform:uppercase;color:#1A1410;">${escapeHtml(e.heading)}</h1>
      ${lines}${e.bodyHtml ?? ''}${rows}${cta}${secondary}${note}
      ${SIGNATURE_HTML}
    </td></tr>
    <tr><td style="padding:18px 0 0;font-family:${FONT};font-size:11px;letter-spacing:0.5px;color:#7A6E62;">
      <a href="https://www.viratmohan.com/retail-os" style="color:#7A6E62;">viratmohan.com/retail-os</a><br>DEVSHOP RETAIL OS&trade; &mdash; BUILT FAST, FOR REAL BUSINESSES
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
