import React from 'react';
import { ArrowLeft, BarChart3, CalendarDays, Eye, LineChart } from 'lucide-react';
import { isLocalOnlyMode, isRemotePersistenceLocked } from '../../../../services/repository/featureFlags';
import { getSupabaseConfig, pullPublicSiteViewsDailyRange, type SupabasePublicSiteViewsDailyRow } from '../../../../services/supabaseRest';

type Granularity = 'day' | 'month' | 'year';

type AggregatedRow = {
    key: string;
    label: string;
    total: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

const startOfRange = (daysBack: number) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() - daysBack);
    return toInputDate(now);
};

const formatNumber = (value: number) => new Intl.NumberFormat('it-IT').format(value);

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

const aggregateRows = (rows: SupabasePublicSiteViewsDailyRow[], granularity: Granularity): AggregatedRow[] => {
    const buckets = new Map<string, number>();
    for (const row of rows) {
        const key = granularity === 'day'
            ? row.view_date
            : granularity === 'month'
                ? row.view_date.slice(0, 7)
                : row.view_date.slice(0, 4);
        buckets.set(key, (buckets.get(key) || 0) + Number(row.views || 0));
    }
    return [...buckets.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, total]) => ({ key, total, label: formatPeriodLabel(key, granularity) }));
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

const StatCard: React.FC<{ label: string; value: string; tone?: 'blue' | 'slate' }> = ({ label, value, tone = 'slate' }) => (
    <div className={`rounded-2xl border p-4 ${tone === 'blue' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
        <div className={`mt-2 text-2xl font-black ${tone === 'blue' ? 'text-blue-800' : 'text-slate-900'}`}>{value}</div>
    </div>
);

export const ViewsSubTab: React.FC<{ onBack: () => void; t: (key: string) => string }> = ({ onBack, t }) => {
    const [granularity, setGranularity] = React.useState<Granularity>('day');
    const [startDate, setStartDate] = React.useState<string>(() => startOfRange(29));
    const [endDate, setEndDate] = React.useState<string>(() => toInputDate(new Date()));
    const [rows, setRows] = React.useState<SupabasePublicSiteViewsDailyRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string>('');
    const remotePersistenceLocked = isRemotePersistenceLocked();

    React.useEffect(() => {
        if (isLocalOnlyMode()) {
            setRows([]);
            setError('');
            return;
        }
        if (!getSupabaseConfig()) {
            setRows([]);
            setError(t('views_supabase_not_configured'));
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError('');
        void pullPublicSiteViewsDailyRange(startDate, endDate)
            .then((next) => {
                if (cancelled) return;
                setRows(next || []);
            })
            .catch((err) => {
                if (cancelled) return;
                setRows([]);
                setError(String(err?.message || err || t('views_load_error')));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [startDate, endDate]);

    const aggregated = React.useMemo(() => aggregateRows(rows, granularity), [rows, granularity]);
    const totalViews = React.useMemo(() => rows.reduce((sum, row) => sum + Number(row.views || 0), 0), [rows]);
    const daysCount = React.useMemo(() => {
        const from = new Date(`${startDate}T00:00:00`).getTime();
        const to = new Date(`${endDate}T00:00:00`).getTime();
        const delta = Math.max(0, Math.round((to - from) / DAY_MS));
        return delta + 1;
    }, [startDate, endDate]);
    const avgPerDay = daysCount > 0 ? totalViews / daysCount : 0;
    const peakBucket = aggregated.reduce<AggregatedRow | null>((best, row) => !best || row.total > best.total ? row : best, null);

    const chartWidth = 960;
    const chartHeight = 280;
    const chartPadding = 28;
    const values = aggregated.map((row) => row.total);
    const path = buildChartPath(values, chartWidth, chartHeight, chartPadding);
    const points = chartPoints(values, chartWidth, chartHeight, chartPadding);
    const maxValue = Math.max(...values, 1);

    const quickRange = (days: number) => {
        const nextEnd = toInputDate(new Date());
        setEndDate(nextEnd);
        setStartDate(addDays(nextEnd, -(days - 1)));
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
                        {t('views_back_to_data')}
                    </button>
                    <div>
                        <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            {t('data_views_title')}
                        </div>
                        <div className="text-xs text-slate-600 font-bold mt-1">
                            {t('views_intro')}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
                    <span className="px-2 py-1 rounded-full border border-sky-200 bg-sky-50 text-sky-800">{t('views_persistent_db')}</span>
                    <span className="px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-700">{t('views_days_months_years')}</span>
                    <span className="px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-700">{t('views_chart_table')}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_360px] gap-4">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm space-y-5">
                    <div className="rounded-[24px] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <div className="text-[11px] font-black uppercase tracking-wide text-blue-700">{t('views_counter')}</div>
                                <div className="mt-3 text-5xl leading-none font-black text-slate-950">{formatNumber(totalViews)}</div>
                                <div className="mt-3 text-sm font-bold text-slate-600">
                                    {t('views_selected_range').replace('{start}', new Date(`${startDate}T00:00:00`).toLocaleDateString('it-IT')).replace('{end}', new Date(`${endDate}T00:00:00`).toLocaleDateString('it-IT'))}
                                </div>
                            </div>
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-[20px] bg-blue-600 text-white shadow-sm">
                                <Eye className="w-8 h-8" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <StatCard label={t('views_daily_average')} value={avgPerDay.toFixed(1)} />
                        <StatCard label={t('views_peak_period')} value={peakBucket ? formatNumber(peakBucket.total) : '0'} />
                        <StatCard label={t('views_displayed_buckets')} value={formatNumber(aggregated.length)} tone="blue" />
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 space-y-4">
                        <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label={t('views_granularity')}>
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
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                            <div className="text-sm font-black text-slate-900 inline-flex items-center gap-2">
                                <LineChart className="w-4 h-4" />
                                {t('views_trend')}
                            </div>
                            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                                {granularity === 'day' ? t('views_per_day') : granularity === 'month' ? t('views_per_month') : t('views_per_year')}
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-10 text-sm font-bold text-slate-500">{t('views_loading_db')}</div>
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
                                <div className="text-sm font-black text-slate-700">{t('views_no_data_title')}</div>
                                <div className="text-xs font-bold text-slate-500">{t('views_no_data_body')}</div>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                <div className="overflow-x-auto">
                                    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-[720px] w-full h-[280px]" role="img" aria-label={t('views_chart_aria')}>
                                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                                            const y = chartHeight - chartPadding - ((chartHeight - chartPadding * 2) * ratio);
                                            const label = Math.round(maxValue * ratio);
                                            return (
                                                <g key={ratio}>
                                                    <line x1={chartPadding} x2={chartWidth - chartPadding} y1={y} y2={y} stroke="#E2E8F0" strokeWidth="1" />
                                                    <text x={8} y={y + 4} fontSize="11" fill="#64748B">{label}</text>
                                                </g>
                                            );
                                        })}
                                        <path d={path} fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                        {points.map((point, index) => (
                                            <g key={`${point.x}-${point.y}`}>
                                                <circle cx={point.x} cy={point.y} r="5" fill="#2563EB" />
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
                                    <div className="grid grid-cols-[minmax(180px,1fr)_140px] bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase tracking-wide text-slate-500">
                                        <div className="px-4 py-3">{t('views_period')}</div>
                                        <div className="px-4 py-3 text-right">{t('views_count')}</div>
                                    </div>
                                    <div className="max-h-[360px] overflow-auto divide-y divide-slate-100">
                                        {aggregated.slice().reverse().map((row) => (
                                            <div key={row.key} className="grid grid-cols-[minmax(180px,1fr)_140px] items-center px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
                                                <div className="text-sm font-black text-slate-900">{row.label}</div>
                                                <div className="text-right text-sm font-black text-blue-800">{formatNumber(row.total)}</div>
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
                                <BarChart3 className="w-4 h-4" />
                                {t('views_reading_data')}
                            </div>
                            <div className="mt-3 space-y-3 text-sm font-bold text-slate-600">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    {t('views_reading_counter_desc')}
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    {t('views_reading_aggregate_desc')}
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    {t('views_reading_chart_desc')}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="text-sm font-black text-slate-900">{t('views_data_origin')}</div>
                            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-900">
                                {remotePersistenceLocked ? (
                                    <>
                                        {t('views_data_origin_public')}
                                    </>
                                ) : (
                                    <>
                                        {t('views_data_origin_local')}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
