import React from 'react';
import { Activity, ArrowLeft, BarChart3, CalendarDays, Database, LineChart } from 'lucide-react';
import { getSupabaseConfig, pullSupabaseUsageDailyRange, type SupabaseTrafficUsageDailyRow } from '../../../../services/supabaseRest';
import { isLocalOnlyMode } from '../../../../services/repository/featureFlags';

type Granularity = 'day' | 'month' | 'year';
type UsageBucket = SupabaseTrafficUsageDailyRow['bucket'];

type AggregatedRow = {
    key: string;
    label: string;
    requestCount: number;
    requestBytes: number;
    responseBytes: number;
    totalBytes: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BILLING_ANCHOR_DAY = 22;
const DEFAULT_MONTHLY_BUDGET_BYTES = 5 * 1024 * 1024 * 1024;

const toInputDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const addDays = (value: string, delta: number) => {
    const base = new Date(`${value}T00:00:00`);
    base.setDate(base.getDate() + delta);
    return toInputDate(base);
};

const shiftMonth = (date: Date, deltaMonths: number) => {
    return new Date(date.getFullYear(), date.getMonth() + deltaMonths, 1);
};

const cycleAnchorDate = (referenceMonth: Date, anchorDay: number) => {
    const lastDay = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth() + 1, 0).getDate();
    return new Date(referenceMonth.getFullYear(), referenceMonth.getMonth(), Math.min(anchorDay, lastDay));
};

const getBillingCycleWindow = (referenceDate: Date, anchorDay: number) => {
    const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    const currentMonthStart = cycleAnchorDate(ref, anchorDay);
    if (ref >= currentMonthStart) {
        const nextReset = cycleAnchorDate(shiftMonth(ref, 1), anchorDay);
        return {
            startDate: toInputDate(currentMonthStart),
            todayDate: toInputDate(ref),
            nextResetDate: toInputDate(nextReset),
            displayEndDate: toInputDate(new Date(nextReset.getFullYear(), nextReset.getMonth(), nextReset.getDate() - 1)),
        };
    }
    const prevMonthStart = cycleAnchorDate(shiftMonth(ref, -1), anchorDay);
    return {
        startDate: toInputDate(prevMonthStart),
        todayDate: toInputDate(ref),
        nextResetDate: toInputDate(currentMonthStart),
        displayEndDate: toInputDate(new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth(), currentMonthStart.getDate() - 1)),
    };
};

const startOfRange = (daysBack: number) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() - daysBack);
    return toInputDate(now);
};

const formatPeriodLabel = (key: string, granularity: Granularity) => {
    if (granularity === 'day') {
        const date = new Date(`${key}T00:00:00`);
        return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    if (granularity === 'month') {
        const [year, month] = key.split('-');
        const date = new Date(Number(year), Number(month) - 1, 1);
        return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    }
    return key;
};

const formatNumber = (value: number) => new Intl.NumberFormat('it-IT').format(value);

const formatBytes = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${Math.round(value)} B`;
};

const aggregateRows = (rows: SupabaseTrafficUsageDailyRow[], granularity: Granularity): AggregatedRow[] => {
    const buckets = new Map<string, AggregatedRow>();
    for (const row of rows) {
        const key = granularity === 'day'
            ? row.usage_date
            : granularity === 'month'
                ? row.usage_date.slice(0, 7)
                : row.usage_date.slice(0, 4);
        const current = buckets.get(key) || {
            key,
            label: formatPeriodLabel(key, granularity),
            requestCount: 0,
            requestBytes: 0,
            responseBytes: 0,
            totalBytes: 0,
        };
        current.requestCount += Number(row.request_count || 0);
        current.requestBytes += Number(row.request_bytes || 0);
        current.responseBytes += Number(row.response_bytes || 0);
        current.totalBytes = current.requestBytes + current.responseBytes;
        buckets.set(key, current);
    }
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
};

const buildChartPath = (values: number[], width: number, height: number, padding: number) => {
    if (!values.length) return '';
    const max = Math.max(...values, 1);
    const stepX = values.length === 1 ? 0 : (width - padding * 2) / (values.length - 1);
    return values
        .map((value, index) => {
            const x = padding + stepX * index;
            const y = height - padding - ((value / max) * (height - padding * 2));
            return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' ');
};

const chartPoints = (values: number[], width: number, height: number, padding: number) => {
    if (!values.length) return [];
    const max = Math.max(...values, 1);
    const stepX = values.length === 1 ? 0 : (width - padding * 2) / (values.length - 1);
    return values.map((value, index) => ({
        x: padding + stepX * index,
        y: height - padding - ((value / max) * (height - padding * 2)),
        value,
    }));
};

const StatCard: React.FC<{ label: string; value: string; tone?: 'blue' | 'slate' | 'emerald' }> = ({ label, value, tone = 'slate' }) => {
    const toneClass = tone === 'blue'
        ? 'border-blue-200 bg-blue-50 text-blue-800'
        : tone === 'emerald'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-slate-200 bg-white text-slate-900';
    return (
        <div className={`rounded-2xl border p-4 ${toneClass}`}>
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-black">{value}</div>
        </div>
    );
};

const bucketToneClass: Record<UsageBucket, string> = {
    public: 'border-sky-200 bg-sky-50 text-sky-800',
    tv: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
    admin: 'border-amber-200 bg-amber-50 text-amber-800',
    referee: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    sync: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    unknown: 'border-slate-200 bg-slate-50 text-slate-800',
};

export const TrafficSubTab: React.FC<{ onBack: () => void; t: (key: string) => string }> = ({ onBack, t }) => {
    const billingCycleWindow = React.useMemo(() => getBillingCycleWindow(new Date(), DEFAULT_BILLING_ANCHOR_DAY), []);
    const [granularity, setGranularity] = React.useState<Granularity>('day');
    const [startDate, setStartDate] = React.useState<string>(() => billingCycleWindow.startDate);
    const [endDate, setEndDate] = React.useState<string>(() => billingCycleWindow.todayDate);
    const [rows, setRows] = React.useState<SupabaseTrafficUsageDailyRow[]>([]);
    const [cycleRows, setCycleRows] = React.useState<SupabaseTrafficUsageDailyRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [cycleLoading, setCycleLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [cycleError, setCycleError] = React.useState('');

    React.useEffect(() => {
        if (isLocalOnlyMode()) {
            setRows([]);
            setError(t('traffic_local_only_not_available'));
            return;
        }
        if (!getSupabaseConfig()) {
            setRows([]);
            setError(t('traffic_supabase_not_configured'));
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError('');
        void pullSupabaseUsageDailyRange(startDate, endDate)
            .then((next) => {
                if (!cancelled) setRows(next || []);
            })
            .catch((err) => {
                if (cancelled) return;
                setRows([]);
                setError(String(err?.message || err || t('traffic_load_error')));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [startDate, endDate]);

    React.useEffect(() => {
        if (isLocalOnlyMode() || !getSupabaseConfig()) {
            setCycleRows([]);
            setCycleError('');
            return;
        }

        let cancelled = false;
        setCycleLoading(true);
        setCycleError('');
        void pullSupabaseUsageDailyRange(billingCycleWindow.startDate, billingCycleWindow.todayDate)
            .then((next) => {
                if (!cancelled) setCycleRows(next || []);
            })
            .catch((err) => {
                if (cancelled) return;
                setCycleRows([]);
                setCycleError(String(err?.message || err || t('traffic_load_error')));
            })
            .finally(() => {
                if (!cancelled) setCycleLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [billingCycleWindow.startDate, billingCycleWindow.todayDate]);

    const aggregated = React.useMemo(() => aggregateRows(rows, granularity), [rows, granularity]);
    const totalRequests = React.useMemo(() => rows.reduce((sum, row) => sum + Number(row.request_count || 0), 0), [rows]);
    const totalRequestBytes = React.useMemo(() => rows.reduce((sum, row) => sum + Number(row.request_bytes || 0), 0), [rows]);
    const totalResponseBytes = React.useMemo(() => rows.reduce((sum, row) => sum + Number(row.response_bytes || 0), 0), [rows]);
    const totalBytes = totalRequestBytes + totalResponseBytes;
    const daysCount = React.useMemo(() => {
        const from = new Date(`${startDate}T00:00:00`).getTime();
        const to = new Date(`${endDate}T00:00:00`).getTime();
        const delta = Math.max(0, Math.round((to - from) / DAY_MS));
        return delta + 1;
    }, [startDate, endDate]);
    const avgBytesPerDay = daysCount > 0 ? totalBytes / daysCount : 0;
    const peakBucket = aggregated.reduce<AggregatedRow | null>((best, row) => (!best || row.totalBytes > best.totalBytes ? row : best), null);
    const cycleTotalBytes = React.useMemo(
        () => cycleRows.reduce((sum, row) => sum + Number(row.request_bytes || 0) + Number(row.response_bytes || 0), 0),
        [cycleRows]
    );
    const cycleRemainingBytes = Math.max(0, DEFAULT_MONTHLY_BUDGET_BYTES - cycleTotalBytes);
    const cycleProgressPct = Math.max(0, Math.min(100, (cycleTotalBytes / DEFAULT_MONTHLY_BUDGET_BYTES) * 100));
    const cycleIsSelected = startDate === billingCycleWindow.startDate && endDate === billingCycleWindow.todayDate;
    const bucketTotals = React.useMemo(() => {
        const map = new Map<UsageBucket, { requestCount: number; totalBytes: number }>();
        for (const row of rows) {
            const bucket = row.bucket || 'unknown';
            const current = map.get(bucket) || { requestCount: 0, totalBytes: 0 };
            current.requestCount += Number(row.request_count || 0);
            current.totalBytes += Number(row.request_bytes || 0) + Number(row.response_bytes || 0);
            map.set(bucket, current);
        }
        return (['public', 'tv', 'admin', 'referee', 'sync', 'unknown'] as UsageBucket[])
            .map((bucket) => ({
                bucket,
                requestCount: map.get(bucket)?.requestCount || 0,
                totalBytes: map.get(bucket)?.totalBytes || 0,
            }))
            .filter((entry) => entry.requestCount > 0 || entry.totalBytes > 0);
    }, [rows]);

    const chartWidth = 960;
    const chartHeight = 280;
    const chartPadding = 28;
    const values = aggregated.map((row) => row.totalBytes);
    const path = buildChartPath(values, chartWidth, chartHeight, chartPadding);
    const points = chartPoints(values, chartWidth, chartHeight, chartPadding);
    const maxValue = Math.max(...values, 1);

    const quickRange = (days: number) => {
        const nextEnd = toInputDate(new Date());
        setEndDate(nextEnd);
        setStartDate(addDays(nextEnd, -(days - 1)));
    };

    const openBillingCycleRange = () => {
        setStartDate(billingCycleWindow.startDate);
        setEndDate(billingCycleWindow.todayDate);
    };

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-black hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {t('traffic_back_to_data')}
                    </button>
                    <div>
                        <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            {t('data_traffic_title')}
                        </div>
                        <div className="text-xs text-slate-600 font-bold mt-1">
                            {t('traffic_intro')}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
                    <span className="px-2 py-1 rounded-full border border-violet-200 bg-violet-50 text-violet-800">{t('traffic_estimated_app')}</span>
                    <span className="px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-700">{t('traffic_bytes_requests')}</span>
                    <span className="px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-700">{t('traffic_days_months_years')}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_360px] gap-4">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm space-y-5">
                    <div className="rounded-[24px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <div className="text-[11px] font-black uppercase tracking-wide text-violet-700">{t('traffic_counter')}</div>
                                <div className="mt-3 text-5xl leading-none font-black text-slate-950">{formatBytes(totalBytes)}</div>
                            <div className="mt-3 text-sm font-bold text-slate-600">
                                {t('traffic_selected_range').replace('{start}', new Date(`${startDate}T00:00:00`).toLocaleDateString('it-IT')).replace('{end}', new Date(`${endDate}T00:00:00`).toLocaleDateString('it-IT'))}
                            </div>
                            </div>
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-[20px] bg-violet-600 text-white shadow-sm">
                                <Database className="w-8 h-8" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <StatCard label={t('traffic_requests')} value={formatNumber(totalRequests)} />
                        <StatCard label={t('traffic_request_bytes')} value={formatBytes(totalRequestBytes)} />
                        <StatCard label={t('traffic_response_bytes')} value={formatBytes(totalResponseBytes)} tone="emerald" />
                        <StatCard label={t('traffic_daily_average')} value={formatBytes(avgBytesPerDay)} tone="blue" />
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 space-y-4">
                        <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label={t('traffic_granularity')}>
                            {([
                                ['day', t('views_days')],
                                ['month', t('views_months')],
                                ['year', t('views_years')],
                            ] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="tab"
                                    aria-selected={granularity === value}
                                    onClick={() => setGranularity(value)}
                                    className={`px-3 py-2 rounded-xl border text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${granularity === value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                            <label className="space-y-1">
                                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('views_from')}</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    max={endDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('views_to')}</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    min={startDate}
                                    max={toInputDate(new Date())}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                />
                            </label>
                            <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                                {[7, 30, 90, 365].map((days) => (
                                    <button
                                        key={days}
                                        type="button"
                                        onClick={() => quickRange(days)}
                                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                    >
                                        {days}g
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={openBillingCycleRange}
                                    className={`px-3 py-2 rounded-xl border text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${cycleIsSelected ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    {t('traffic_billing_cycle_button')}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                            <div className="text-sm font-black text-slate-900 inline-flex items-center gap-2">
                                <LineChart className="w-4 h-4" />
                                {t('traffic_trend')}
                            </div>
                            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                                {granularity === 'day' ? t('traffic_per_day') : granularity === 'month' ? t('traffic_per_month') : t('traffic_per_year')}
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-10 text-sm font-bold text-slate-500">{t('traffic_loading_db')}</div>
                        ) : error ? (
                            <div className="p-6">
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                                    {error}
                                </div>
                            </div>
                        ) : aggregated.length === 0 ? (
                            <div className="p-10 text-center space-y-2">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 text-slate-500">
                                    <CalendarDays className="w-6 h-6" />
                                </div>
                                <div className="text-sm font-black text-slate-700">{t('traffic_no_data_title')}</div>
                                <div className="text-xs font-bold text-slate-500">{t('traffic_no_data_body')}</div>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                <div className="overflow-x-auto">
                                    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-[720px] w-full h-[280px]" role="img" aria-label={t('traffic_chart_aria')}>
                                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                                            const y = chartHeight - chartPadding - ((chartHeight - chartPadding * 2) * ratio);
                                            const label = formatBytes(Math.round(maxValue * ratio));
                                            return (
                                                <g key={ratio}>
                                                    <line x1={chartPadding} x2={chartWidth - chartPadding} y1={y} y2={y} stroke="#E2E8F0" strokeWidth="1" />
                                                    <text x={8} y={y + 4} fontSize="11" fill="#64748B">{label}</text>
                                                </g>
                                            );
                                        })}
                                        <path d={path} fill="none" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                        {points.map((point, index) => (
                                            <g key={`${point.x}-${point.y}`}>
                                                <circle cx={point.x} cy={point.y} r="5" fill="#7C3AED" />
                                                {index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2) ? (
                                                    <text x={point.x} y={chartHeight - 6} textAnchor="middle" fontSize="11" fill="#64748B">
                                                        {aggregated[index]?.label}
                                                    </text>
                                                ) : null}
                                            </g>
                                        ))}
                                    </svg>
                                </div>

                                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                    <div className="grid grid-cols-[minmax(180px,1fr)_140px_140px_120px] bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase tracking-wide text-slate-500">
                                        <div className="px-4 py-3">{t('traffic_period')}</div>
                                        <div className="px-4 py-3 text-right">{t('traffic_total_bytes')}</div>
                                        <div className="px-4 py-3 text-right">{t('traffic_response_bytes_short')}</div>
                                        <div className="px-4 py-3 text-right">{t('traffic_requests_short')}</div>
                                    </div>
                                    <div className="max-h-[360px] overflow-auto divide-y divide-slate-100">
                                        {aggregated.slice().reverse().map((row) => (
                                            <div key={row.key} className="grid grid-cols-[minmax(180px,1fr)_140px_140px_120px] items-center px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
                                                <div className="text-sm font-black text-slate-900">{row.label}</div>
                                                <div className="text-right text-sm font-black text-violet-800">{formatBytes(row.totalBytes)}</div>
                                                <div className="text-right text-sm font-black text-emerald-800">{formatBytes(row.responseBytes)}</div>
                                                <div className="text-right text-sm font-black text-slate-700">{formatNumber(row.requestCount)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="sticky top-24 space-y-4">
                        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="text-sm font-black text-slate-900 inline-flex items-center gap-2">
                                <Database className="w-4 h-4" />
                                {t('traffic_budget_title')}
                            </div>
                            <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm font-bold text-violet-900">
                                {t('traffic_billing_cycle_span')
                                    .replace('{start}', new Date(`${billingCycleWindow.startDate}T00:00:00`).toLocaleDateString('it-IT'))
                                    .replace('{end}', new Date(`${billingCycleWindow.displayEndDate}T00:00:00`).toLocaleDateString('it-IT'))}
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3">
                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('traffic_budget_progress')}</div>
                                    <div className="mt-2 text-xl font-black text-slate-900">
                                        {formatBytes(cycleTotalBytes)} / {formatBytes(DEFAULT_MONTHLY_BUDGET_BYTES)}
                                    </div>
                                    <div className="mt-3 h-3 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${cycleProgressPct >= 90 ? 'bg-rose-500' : cycleProgressPct >= 70 ? 'bg-amber-500' : 'bg-violet-600'}`}
                                            style={{ width: `${cycleProgressPct}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <StatCard label={t('traffic_budget_remaining')} value={formatBytes(cycleRemainingBytes)} tone="emerald" />
                                    <StatCard label={t('traffic_next_reset')} value={new Date(`${billingCycleWindow.nextResetDate}T00:00:00`).toLocaleDateString('it-IT')} tone="blue" />
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-600">
                                    {t('traffic_budget_assumption')}
                                </div>
                                {cycleLoading ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">
                                        {t('traffic_loading_db')}
                                    </div>
                                ) : cycleError ? (
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                                        {cycleError}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="text-sm font-black text-slate-900 inline-flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" />
                                {t('traffic_breakdown')}
                            </div>
                            <div className="mt-3 space-y-3">
                                {bucketTotals.length === 0 ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">
                                        {t('traffic_no_breakdown')}
                                    </div>
                                ) : bucketTotals.map((entry) => (
                                    <div key={entry.bucket} className={`rounded-2xl border p-3 ${bucketToneClass[entry.bucket]}`}>
                                        <div className="text-sm font-black">{t(`traffic_bucket_${entry.bucket}`)}</div>
                                        <div className="mt-1 text-xs font-bold opacity-80">{formatNumber(entry.requestCount)} req</div>
                                        <div className="mt-2 text-lg font-black">{formatBytes(entry.totalBytes)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="text-sm font-black text-slate-900">{t('traffic_data_origin')}</div>
                            <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm font-bold text-violet-900">
                                {t('traffic_data_origin_desc')}
                            </div>
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-600">
                                {peakBucket ? t('traffic_peak_period').replace('{period}', peakBucket.label).replace('{value}', formatBytes(peakBucket.totalBytes)) : t('traffic_peak_empty')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
