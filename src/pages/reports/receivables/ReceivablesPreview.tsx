import { useEffect, useRef, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { endpoint } from '$app/common/helpers';
import { request } from '$app/common/helpers/request';
import { useCurrentCompany } from '$app/common/hooks/useCurrentCompany';
import { useTitle } from '$app/common/hooks/useTitle';
import { Default } from '$app/components/layouts/Default';
import { Button, Link } from '$app/components/forms';
import {
  PreviewSnapshot,
  visiblePreview,
  readPreview,
  exactAmount,
} from './preview';

export default function ReceivablesPreview() {
  const [t, i18n] = useTranslation();
  const { documentTitle } = useTitle('rp_title');
  const company = useCurrentCompany();
  const [params, setParams] = useSearchParams();
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const date = params.get('date') ?? localDate;
  const days = params.get('days') ?? '1';
  const [snapshot, setSnapshot] = useState<PreviewSnapshot>();
  // Hide prior company/date results synchronously, before effects invalidate in-flight work.
  const preview = visiblePreview(snapshot, {
    companyId: company?.id,
    date,
    days,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController>();
  const generation = useRef(0);
  const inputClass =
    'block w-full min-h-11 rounded border border-gray-400 bg-transparent px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  const clear = () => {
    generation.current++;
    controller.current?.abort();
    setSnapshot(undefined);
    setBusy(false);
    setError('');
  };
  useEffect(() => {
    clear();
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [company?.id, date, days]);
  const update = (key: string, value: string) => {
    clear();
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.delete('page');
    setParams(next, { replace: true });
  };
  const rawPage = Number(params.get('page') ?? 1);
  const pages = Math.max(1, Math.ceil((preview?.rows.length ?? 0) / 25));
  const page = Number.isInteger(rawPage)
    ? Math.max(1, Math.min(rawPage, pages))
    : 1;
  const changePage = (value: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(value));
    setParams(next);
  };
  const refresh = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!company?.id) {
      setError('rp_access');
      return;
    }
    clear();
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date ||
      !/^[1-9][0-9]*$/.test(days) ||
      Number(days) > 3650
    ) {
      setError('rp_invalid');
      return;
    }
    const own = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const response = await request(
        'POST',
        endpoint('/api/v1/reports/receivables_preview'),
        { as_of_date: date, minimum_overdue_days: Number(days) },
        { skipIntercept: true, signal: abort.signal }
      );
      const next = readPreview(response.data);
      if (next.as_of_date !== date) throw new Error('Mismatched preview date');
      if (own === generation.current)
        setSnapshot({ data: next, companyId: company?.id, date, days });
    } catch (failure) {
      if (own !== generation.current || abort.signal.aborted) return;
      const status = isAxiosError(failure)
        ? failure.response?.status
        : undefined;
      setError(
        status === 401 || status === 403
          ? 'rp_access'
          : status === 413
            ? 'rp_capacity'
            : status === 422 &&
                isAxiosError(failure) &&
                failure.response?.data?.errors
              ? 'rp_invalid'
              : 'rp_failure'
      );
    } finally {
      if (own === generation.current) setBusy(false);
    }
  };
  const stateLabel = (state: string) =>
    ({
      hold_context_unverified: 'rp_unverified',
      not_eligible: 'rp_below',
      reminders_disabled: 'rp_disabled',
      due_date_required: 'rp_date_missing',
    })[state] ?? 'rp_other';
  return (
    <Default
      title={documentTitle}
      breadcrumbs={[
        { name: t('reports'), href: '/reports' },
        { name: t('rp_title'), href: '/reports/receivables-preview' },
      ]}
    >
      <div className="space-y-5 max-w-6xl" dir={i18n.dir()}>
        <p>{t('rp_intro')}</p>
        <p className="rounded border border-amber-500 bg-amber-50 text-amber-950 p-4">
          {t('rp_hold')}
        </p>
        <form
          onSubmit={refresh}
          className="grid gap-4 sm:grid-cols-3 items-end"
          aria-busy={busy}
        >
          <div>
            <label htmlFor="preview-date" className="block mb-2">
              {t('rp_date')}
            </label>
            <input
              id="preview-date"
              type="date"
              required
              value={date}
              onChange={(e) => update('date', e.target.value)}
              className={inputClass}
              aria-describedby="preview-help"
            />
          </div>
          <div>
            <label htmlFor="preview-days" className="block mb-2">
              {t('rp_days')}
            </label>
            <input
              id="preview-days"
              type="number"
              min="1"
              max="3650"
              step="1"
              required
              value={days}
              onChange={(e) => update('days', e.target.value)}
              className={inputClass}
              aria-describedby="preview-help"
            />
          </div>
          <Button
            disabled={busy || !company?.id}
            className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t('rp_run')}
          </Button>
          <p id="preview-help" className="sm:col-span-3 text-sm">
            {t('rp_help')}
          </p>
        </form>
        <div role="status" aria-live="polite" aria-atomic="true">
          {busy
            ? t('rp_loading')
            : error
              ? t(error)
              : !preview
                ? t('rp_idle')
                : !preview.rows.length
                  ? t('rp_empty')
                  : t('rp_page', { page, pages, count: preview.rows.length })}
        </div>
        {error && <Link to="/reports">{t('reports')}</Link>}
        {preview && (
          <section
            aria-label={t('rp_title') ?? undefined}
            className="space-y-4"
          >
            <p>{t('rp_scope')}</p>
            <p className="text-sm">
              {t('rp_read')}: <bdi>{preview.generated_at}</bdi>
            </p>
            <dl className="flex flex-wrap gap-4">
              {Object.entries(preview.open_receivables_minor_by_currency).map(
                ([code, minor]) => (
                  <div key={code} className="border rounded p-4">
                    <dt>
                      {t('rp_balance')} · <bdi>{code}</bdi>
                    </dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      <bdi>
                        {exactAmount(
                          minor,
                          preview.currency_precisions[code],
                          i18n.language
                        )}{' '}
                        {code}
                      </bdi>
                    </dd>
                  </div>
                )
              )}
            </dl>
            {!!preview.rows.length && (
              <>
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-start">
                    <caption className="sr-only">{t('rp_scope')}</caption>
                    <thead>
                      <tr>
                        {[
                          'rp_reference',
                          'rp_balance',
                          'rp_overdue',
                          'rp_review',
                        ].map((key) => (
                          <th
                            key={key}
                            scope="col"
                            className="text-start p-3 border-b"
                          >
                            {t(key)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows
                        .slice((page - 1) * 25, page * 25)
                        .map((row) => (
                          <tr key={row.invoice_id}>
                            <td className="p-3 border-b break-words max-w-xs">
                              <Link to={`/invoices/${row.invoice_id}/edit`}>
                                <bdi>
                                  {preview.provenance[row.invoice_id]
                                    .invoice_number || row.invoice_id}
                                </bdi>
                              </Link>
                            </td>
                            <td className="p-3 border-b whitespace-nowrap tabular-nums">
                              <bdi>
                                {exactAmount(
                                  row.balance_minor,
                                  preview.currency_precisions[row.currency],
                                  i18n.language
                                )}{' '}
                                {row.currency}
                              </bdi>
                            </td>
                            <td className="p-3 border-b tabular-nums">
                              <bdi>
                                {row.overdue_days === null
                                  ? '—'
                                  : new Intl.NumberFormat(i18n.language).format(
                                      row.overdue_days
                                    )}
                              </bdi>
                            </td>
                            <td className="p-3 border-b">
                              {t(stateLabel(row.state))}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <nav
                  aria-label={
                    t('rp_page', {
                      page,
                      pages,
                      count: preview.rows.length,
                    }) ?? undefined
                  }
                  className="flex flex-wrap gap-3 items-center"
                >
                  <Button
                    type="secondary"
                    behavior="button"
                    disabled={page === 1}
                    disableWithoutIcon
                    onClick={() => changePage(page - 1)}
                    className="min-h-11 focus-visible:outline focus-visible:outline-2"
                  >
                    {t('rp_previous')}
                  </Button>
                  <span>
                    {t('rp_page', { page, pages, count: preview.rows.length })}
                  </span>
                  <Button
                    type="secondary"
                    behavior="button"
                    disabled={page === pages}
                    disableWithoutIcon
                    onClick={() => changePage(page + 1)}
                    className="min-h-11 focus-visible:outline focus-visible:outline-2"
                  >
                    {t('rp_next')}
                  </Button>
                </nav>
              </>
            )}
          </section>
        )}
      </div>
    </Default>
  );
}
