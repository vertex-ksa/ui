export const receivablesPreviewEnabled =
  import.meta.env.DEV &&
  import.meta.env.VITE_RECEIVABLES_PREVIEW_ENABLED === 'true';
export interface PreviewRow {
  invoice_id: string;
  source_version: number;
  currency: string;
  balance_minor: string;
  overdue_days: number | null;
  state: string;
  dispatch_allowed: false;
}
export interface Preview {
  provenance: Record<string, { invoice_number: string }>;
  preview_only: true;
  complete_within_scope: true;
  balance_basis: string;
  generated_at: string;
  as_of_date: string;
  rows: PreviewRow[];
  currency_precisions: Record<string, number>;
  open_receivables_minor_by_currency: Record<string, string>;
}
const states = new Set([
  'settled',
  'canceled',
  'consent_revoked',
  'reminders_disabled',
  'dispute_hold',
  'promise_hold',
  'due_date_required',
  'not_eligible',
  'hold_context_unverified',
  'manual_review_required',
]);
export function exactAmount(
  minor: string,
  precision: number,
  locale: string
): string {
  if (
    !/^(0|[1-9][0-9]*)$/.test(minor) ||
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > 6
  )
    throw new Error('Invalid native amount');
  const numberLocale =
    locale.split('-')[0] === 'ar' ? locale + '-u-nu-arab' : locale;
  const padded = minor.padStart(precision + 1, '0');
  const integer = precision ? padded.slice(0, -precision) : padded;
  const whole = new Intl.NumberFormat(numberLocale, {
    maximumFractionDigits: 0,
  }).format(BigInt(integer));
  if (!precision) return whole;
  const separator = new Intl.NumberFormat(numberLocale)
    .formatToParts(1.1)
    .find((p) => p.type === 'decimal')?.value;
  const digits = padded
    .slice(-precision)
    .split('')
    .map((d) =>
      new Intl.NumberFormat(numberLocale, { useGrouping: false }).format(
        Number(d)
      )
    )
    .join('');
  return whole + separator + digits;
}
export function readPreview(value: unknown): Preview {
  const p = value as Preview;
  if (
    !p ||
    p.preview_only !== true ||
    p.complete_within_scope !== true ||
    p.balance_basis !== 'current_native_balance_at_read_time' ||
    !Array.isArray(p.rows) ||
    p.rows.length > 1000 ||
    typeof p.generated_at !== 'string' ||
    !Number.isFinite(Date.parse(p.generated_at)) ||
    typeof p.as_of_date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.as_of_date) ||
    !p.currency_precisions ||
    !p.open_receivables_minor_by_currency ||
    !p.provenance
  )
    throw new Error('Invalid preview');
  const ids = new Set<string>();
  for (const row of p.rows) {
    if (
      !row ||
      typeof row.invoice_id !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(row.invoice_id) ||
      ids.has(row.invoice_id) ||
      row.dispatch_allowed !== false ||
      !states.has(row.state) ||
      !Number.isInteger(row.source_version) ||
      typeof row.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(row.currency) ||
      (row.overdue_days !== null &&
        (!Number.isInteger(row.overdue_days) || row.overdue_days < 0))
    )
      throw new Error('Invalid row');
    if (
      typeof p.provenance[row.invoice_id]?.invoice_number !== 'string' ||
      p.provenance[row.invoice_id].invoice_number.length > 1024
    )
      throw new Error('Invalid invoice identity');
    ids.add(row.invoice_id);
    exactAmount(row.balance_minor, p.currency_precisions[row.currency], 'en');
  }
  for (const [currency, amount] of Object.entries(
    p.open_receivables_minor_by_currency
  ))
    exactAmount(amount, p.currency_precisions[currency], 'en');
  // Totals must cover all rows, never just the displayed page.
  const totals: Record<string, bigint> = {};
  for (const row of p.rows)
    totals[row.currency] =
      (totals[row.currency] ?? 0n) + BigInt(row.balance_minor);
  for (const currency of new Set([
    ...Object.keys(totals),
    ...Object.keys(p.open_receivables_minor_by_currency),
  ]))
    if (
      (totals[currency] ?? 0n) !==
      BigInt(p.open_receivables_minor_by_currency[currency] ?? '-1')
    )
      throw new Error('Incomplete totals');
  return p;
}

export interface PreviewContext {
  companyId: string | undefined;
  date: string;
  days: string;
}
export interface PreviewSnapshot extends PreviewContext {
  data: Preview;
}
export function visiblePreview(
  snapshot: PreviewSnapshot | undefined,
  current: PreviewContext
): Preview | undefined {
  return !!current.companyId &&
    !!snapshot?.companyId &&
    snapshot.companyId === current.companyId &&
    snapshot?.date === current.date &&
    snapshot?.days === current.days
    ? snapshot.data
    : undefined;
}
