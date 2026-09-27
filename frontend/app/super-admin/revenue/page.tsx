"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import {
    AlertCircle,
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    CreditCard,
    IndianRupee,
    Link2,
    Link2Off,
    RefreshCw,
    Store,
    TrendingUp,
    Users,
} from "lucide-react"
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import { getRevenueOverview, type BillingRow, type RevenueOverview } from "@/lib/api"

const STATUS_STYLES: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    TRIAL: "bg-blue-100 text-blue-800",
    PAST_DUE: "bg-red-100 text-red-800",
    GRACE: "bg-amber-100 text-amber-800",
    SUSPENDED: "bg-slate-200 text-slate-700",
    CANCELLED: "bg-slate-100 text-slate-500",
}

function formatCurrency(value: number) {
    return `₹${Math.round(value).toLocaleString("en-IN")}`
}

function formatCompactCurrency(value: number) {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
    return `₹${Math.round(value)}`
}

function formatMonth(month: string) {
    const [year, m] = month.split("-")
    const date = new Date(Number(year), Number(m) - 1, 1)
    return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
}

function formatDate(iso: string | null) {
    if (!iso) return "—"
    return new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    })
}

function humanize(key: string) {
    return key
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

function StatusBadge({ status }: { status: string }) {
    return (
        <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"
            }`}
        >
            {humanize(status)}
        </span>
    )
}

function MetricCard({
    title,
    value,
    icon: Icon,
    change,
    caption,
}: {
    title: string
    value: string
    icon: React.ElementType
    change?: number
    caption?: string
}) {
    const isPositive = (change ?? 0) >= 0

    return (
        <Card className="p-6 border-[#e6dcc8] bg-white">
            <div className="flex justify-between items-start mb-4">
                <div className="min-w-0">
                    <p className="text-sm text-[#8B4513] font-medium">{title}</p>
                    <h3 className="text-3xl font-bold text-[#2B1A12] mt-1 truncate">{value}</h3>
                </div>
                <div className="w-12 h-12 shrink-0 bg-[#BF5700]/10 rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6 text-[#BF5700]" />
                </div>
            </div>
            {change !== undefined ? (
                <div className="flex items-center gap-1 text-sm">
                    <span
                        className={`flex items-center gap-1 font-semibold ${isPositive ? "text-green-600" : "text-red-600"}`}
                    >
                        {isPositive ? (
                            <ArrowUpRight className="w-4 h-4" />
                        ) : (
                            <ArrowDownRight className="w-4 h-4" />
                        )}
                        {Math.abs(change)}%
                    </span>
                    <span className="text-[#8B4513]">{caption}</span>
                </div>
            ) : (
                <p className="text-sm text-[#8B4513]">{caption}</p>
            )}
        </Card>
    )
}

function AccountList({
    title,
    subtitle,
    rows,
    dateLabel,
    pickDate,
    emptyLabel,
}: {
    title: string
    subtitle: string
    rows: BillingRow[]
    dateLabel: string
    pickDate: (row: BillingRow) => string | null
    emptyLabel: string
}) {
    return (
        <Card className="p-6 border-[#e6dcc8] bg-white">
            <div className="mb-4">
                <h2 className="text-lg font-bold text-[#2B1A12]">{title}</h2>
                <p className="text-sm text-[#8B4513]">{subtitle}</p>
            </div>
            {rows.length === 0 ? (
                <p className="text-sm text-[#8B4513] py-6 text-center">{emptyLabel}</p>
            ) : (
                <div className="space-y-1">
                    {rows.map((row) => (
                        <div
                            key={row.shopId}
                            className="flex items-center justify-between gap-4 py-3 border-b border-[#f0e9dd] last:border-0"
                        >
                            <div className="min-w-0">
                                <p className="font-semibold text-[#2B1A12] truncate">
                                    {row.shopName}
                                </p>
                                <p className="text-xs text-[#8B4513]">
                                    {humanize(row.plan)} · {formatCurrency(row.priceMonthly)}/mo
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-sm font-semibold text-[#2B1A12]">
                                    {formatDate(pickDate(row))}
                                </p>
                                <p className="text-xs text-[#8B4513]">{dateLabel}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    )
}

export default function RevenuePage() {
    const [data, setData] = useState<RevenueOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await getRevenueOverview())
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load revenue overview")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    return (
        <div className="p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-[#2B1A12] mb-2">Revenue & Billing</h1>
                    <p className="text-[#8B4513]">
                        Subscription revenue across every cafe on the platform
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    aria-label="Refresh revenue"
                    className="p-2 bg-white rounded-lg border border-[#e6dcc8] text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50 self-start"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {error && (
                <Card className="p-6 border-red-200 bg-red-50 mb-8 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-900">Could not load revenue</p>
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                </Card>
            )}

            {loading && !data ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Card key={index} className="p-6 border-[#e6dcc8] bg-white">
                            <div className="h-24 animate-pulse bg-[#f8f5f2] rounded" />
                        </Card>
                    ))}
                </div>
            ) : data ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                        <MetricCard
                            title="MRR"
                            value={formatCurrency(data.mrr)}
                            icon={IndianRupee}
                            change={data.growth.mrr}
                            caption="added this month"
                        />
                        <MetricCard
                            title="ARR"
                            value={formatCurrency(data.arr)}
                            icon={TrendingUp}
                            caption="MRR run rate over 12 months"
                        />
                        <MetricCard
                            title="Paying Accounts"
                            value={String(data.counts.active + data.counts.pastDue + data.counts.grace)}
                            icon={CreditCard}
                            caption={`${data.counts.trialing} on trial · ${data.counts.total} total`}
                        />
                        <MetricCard
                            title="ARPA"
                            value={formatCurrency(data.arpa)}
                            icon={Users}
                            caption="Average revenue per account"
                        />
                    </div>

                    {(data.atRisk.subscriptions > 0 || data.counts.withoutSubscription > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {data.atRisk.subscriptions > 0 && (
                                <Card className="p-6 border-amber-200 bg-amber-50 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-amber-900">
                                            {formatCurrency(data.atRisk.mrr)} of MRR at risk
                                        </p>
                                        <p className="text-sm text-amber-800">
                                            {data.atRisk.subscriptions} subscription
                                            {data.atRisk.subscriptions === 1 ? " is" : "s are"} past
                                            due or in grace. Collect before they suspend.
                                        </p>
                                    </div>
                                </Card>
                            )}
                            {data.counts.withoutSubscription > 0 && (
                                <Card className="p-6 border-[#e6dcc8] bg-white flex items-start gap-3">
                                    <Store className="w-5 h-5 text-[#BF5700] shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-[#2B1A12]">
                                            {data.counts.withoutSubscription} cafe
                                            {data.counts.withoutSubscription === 1 ? "" : "s"} with
                                            no subscription
                                        </p>
                                        <p className="text-sm text-[#8B4513]">
                                            These cafes are live but not billed at all.
                                        </p>
                                    </div>
                                </Card>
                            )}
                        </div>
                    )}

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">MRR Trend</h2>
                            <p className="text-sm text-[#8B4513]">
                                Committed monthly revenue over the last 12 months
                            </p>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={data.mrrTrend}>
                                <defs>
                                    <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#BF5700" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#BF5700" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e6dcc8" />
                                <XAxis
                                    dataKey="month"
                                    tickFormatter={formatMonth}
                                    stroke="#8B4513"
                                    fontSize={12}
                                />
                                <YAxis
                                    stroke="#8B4513"
                                    fontSize={12}
                                    tickFormatter={formatCompactCurrency}
                                />
                                <Tooltip
                                    labelFormatter={(label) => formatMonth(String(label))}
                                    formatter={(value: number) => [formatCurrency(value), "MRR"]}
                                    contentStyle={{ borderRadius: 8, border: "1px solid #e6dcc8" }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="mrr"
                                    stroke="#BF5700"
                                    strokeWidth={2}
                                    fill="url(#mrrFill)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Card>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <Card className="p-6 border-[#e6dcc8] bg-white">
                            <div className="mb-6">
                                <h2 className="text-lg font-bold text-[#2B1A12]">Revenue by Plan</h2>
                                <p className="text-sm text-[#8B4513]">
                                    Where the recurring revenue sits
                                </p>
                            </div>
                            {data.planMix.length === 0 ? (
                                <p className="text-sm text-[#8B4513] py-6 text-center">
                                    No subscriptions yet
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {data.planMix.map((entry) => (
                                        <div key={entry.plan}>
                                            <div className="flex justify-between text-sm mb-1.5">
                                                <span className="font-medium text-[#2B1A12]">
                                                    {humanize(entry.plan)}
                                                    <span className="text-[#8B4513] font-normal">
                                                        {" "}
                                                        · {entry.subscriptions} account
                                                        {entry.subscriptions === 1 ? "" : "s"}
                                                    </span>
                                                </span>
                                                <span className="text-[#8B4513]">
                                                    {formatCurrency(entry.mrr)} · {entry.share}%
                                                </span>
                                            </div>
                                            <div className="h-2 bg-[#f8f5f2] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-[#BF5700]"
                                                    style={{ width: `${entry.share}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        <Card className="p-6 border-[#e6dcc8] bg-white">
                            <div className="mb-6">
                                <h2 className="text-lg font-bold text-[#2B1A12]">
                                    Subscription Health
                                </h2>
                                <p className="text-sm text-[#8B4513]">
                                    Accounts by billing state
                                </p>
                            </div>
                            {data.statusMix.length === 0 ? (
                                <p className="text-sm text-[#8B4513] py-6 text-center">
                                    No subscriptions yet
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {data.statusMix.map((entry) => (
                                        <div
                                            key={entry.status}
                                            className="flex items-center justify-between gap-4 py-3 border-b border-[#f0e9dd] last:border-0"
                                        >
                                            <StatusBadge status={entry.status} />
                                            <div className="text-right">
                                                <span className="font-bold text-[#2B1A12]">
                                                    {entry.subscriptions}
                                                </span>
                                                <span className="text-sm text-[#8B4513]">
                                                    {" "}
                                                    · {formatCurrency(entry.mrr)} MRR
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <AccountList
                            title="Trials Ending Soon"
                            subtitle="Convert these within the next 7 days"
                            rows={data.trialsEndingSoon}
                            dateLabel="trial ends"
                            pickDate={(row) => row.trialEndsAt}
                            emptyLabel="No trials ending in the next 7 days"
                        />
                        <AccountList
                            title="Renewals Due"
                            subtitle="Billing periods closing within 30 days"
                            rows={data.renewalsDue}
                            dateLabel="renews"
                            pickDate={(row) => row.currentPeriodEnd}
                            emptyLabel="No renewals due in the next 30 days"
                        />
                    </div>

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">Billing by Cafe</h2>
                            <p className="text-sm text-[#8B4513]">
                                Every subscription, highest value first
                            </p>
                        </div>
                        {data.billing.length === 0 ? (
                            <p className="text-sm text-[#8B4513] py-8 text-center">
                                No subscriptions on the platform yet
                            </p>
                        ) : (
                            <div className="overflow-x-auto -mx-6 px-6">
                                <table className="w-full text-sm min-w-[640px]">
                                    <thead>
                                        <tr className="text-left text-[#8B4513] border-b border-[#e6dcc8]">
                                            <th className="pb-3 font-semibold">Cafe</th>
                                            <th className="pb-3 font-semibold">Plan</th>
                                            <th className="pb-3 font-semibold">Status</th>
                                            <th className="pb-3 font-semibold text-right">
                                                Monthly
                                            </th>
                                            <th className="pb-3 font-semibold">Renews</th>
                                            <th className="pb-3 font-semibold">Auto-collect</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.billing.map((row) => (
                                            <tr
                                                key={row.shopId}
                                                className="border-b border-[#f0e9dd] last:border-0"
                                            >
                                                <td className="py-3 font-semibold text-[#2B1A12]">
                                                    {row.shopName}
                                                </td>
                                                <td className="py-3 text-[#8B4513]">
                                                    {humanize(row.plan)}
                                                </td>
                                                <td className="py-3">
                                                    <StatusBadge status={row.status} />
                                                </td>
                                                <td className="py-3 text-right font-semibold text-[#2B1A12]">
                                                    {row.isBilled ? (
                                                        formatCurrency(row.priceMonthly)
                                                    ) : (
                                                        <span className="text-[#8B4513] font-normal">
                                                            not billed
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3 text-[#8B4513]">
                                                    {formatDate(row.currentPeriodEnd)}
                                                </td>
                                                <td className="py-3">
                                                    {row.hasPaymentLink ? (
                                                        <span className="flex items-center gap-1.5 text-green-700">
                                                            <Link2 className="w-4 h-4" />
                                                            Linked
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1.5 text-[#8B4513]">
                                                            <Link2Off className="w-4 h-4" />
                                                            Manual
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>
            ) : null}
        </div>
    )
}
