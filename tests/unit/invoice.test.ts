import { describe, it, expect } from 'vitest';
import { financialYear, invoiceNumber, priceLine, priceInvoice, missingFields, amountInWords, type Settings } from '../../src/lib/invoice';

const S: Settings = { issuer_name: 'Virat Mohan', address: 'Gurugram', email: 'founder@viratmohan.com', phone: null, pan: 'X', gstin: null, gst_rate: null, bank_name: 'HDFC', account_name: 'Virat Mohan', account_no: '1', ifsc: 'I', account_type: null, upi_id: null, payment_terms_days: 7, footer_note: null };

describe('numbering', () => {
  it('uses the Indian financial year', () => {
    expect(financialYear('2026-09-30')).toBe('26-27');
    expect(financialYear('2027-03-31')).toBe('26-27');
    expect(financialYear('2027-04-01')).toBe('27-28');
    expect(invoiceNumber('26-27', 7)).toBe('DS/26-27/0007');
  });
});

describe('lines', () => {
  it('prices each basis', () => {
    expect(priceLine({ basis: 'retainer', amount: 100000 }, { start: '2026-10-01', end: '2026-10-31' })).toMatchObject({ amount: 100000, description: 'DevShop Retail OS retainer, October 2026' });
    expect(priceLine({ basis: 'profit_pct', pct: 40, base: 250000 }, { start: '2026-09-01', end: '2026-09-30' }).amount).toBe(100000);
    expect(priceLine({ basis: 'revenue_pct', pct: 1, base: 123456 }).amount).toBe(1234.56);
    expect(priceLine({ basis: 'deposit' }).amount).toBe(5000);
  });
  it('explains what is missing instead of guessing', () => {
    expect(() => priceLine({ basis: 'profit_pct', pct: 40 })).toThrow('Profit pool for the period is missing');
    expect(() => priceLine({ basis: 'fixed', amount: 100 })).toThrow('Describe the fixed fee');
  });
  it('adds GST only when a GSTIN is set', () => {
    const d = { billTo: { company: 'X', address: 'Y' }, issueDate: '2026-10-01', lines: [{ basis: 'fixed' as const, description: 'Build', amount: 1000 }] };
    expect(priceInvoice(d, S)).toMatchObject({ subtotal: 1000, tax: 0, total: 1000 });
    expect(priceInvoice(d, { gstin: '07ABCDE', gst_rate: 18 })).toMatchObject({ tax: 180, total: 1180 });
  });
});

describe('asking for what is missing', () => {
  it('lists missing settings and draft fields', () => {
    const m = missingFields({ ...S, pan: null, account_no: '' }, { billTo: { company: 'Travaholic' }, issueDate: '2026-10-01', lines: [{ basis: 'profit_pct', pct: 40 }] });
    expect(m).toEqual(expect.arrayContaining(['Your PAN (Invoice settings)', 'Bank account number (Invoice settings)', "The client's billing address", 'Line 1: Profit pool for the period is missing', 'The period this invoice covers']));
    expect(missingFields(S, { billTo: { company: 'A', address: 'B' }, issueDate: '2026-10-01', lines: [{ basis: 'deposit' }] })).toEqual([]);
  });
});

describe('amount in words', () => {
  it('uses lakh and crore', () => {
    expect(amountInWords(100000)).toBe('One lakh rupees only');
    expect(amountInWords(118000)).toBe('One lakh eighteen thousand rupees only');
    expect(amountInWords(12345678.5)).toBe('One crore twenty-three lakh forty-five thousand six hundred seventy-eight rupees and fifty paise only');
  });
});
