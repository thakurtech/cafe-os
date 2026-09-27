"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import {
    Activity,
    AlertCircle,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    IndianRupee,
    RefreshCw,
    ShoppingBag,
    Store,
    UserPlus,
} from "lucide-react"
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import { getPlatformAnalytics, type PlatformAnalytics } from "@/lib/api"

const RANGES = [
    { label: "7 days", days: 7 },
    { label: "30 days", days: 30 },
    { label: "90 days", days: 90 },
]

const MIX_COLORS = ["#BF5700", "#8B4513", "#D98324", "#5C3A21", "#E9B872", "#A9714B"]

function formatCurrency(value: number) {
    return `₹${Math.round(value).toLocaleString("en-IN")}`
}

function formatCompactCurrency(value: number) {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
    return `₹${Math.round(value)}`
}

function formatDay(iso: string) {
    const date = new Date(`${iso}T00:00:00`)
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function formatHour(hour: number) {
    const suffix = hour < 12 ? "AM" : "PM"
    const display = hour % 12 === 0 ? 12 : hour % 12
    return `${display} ${suffix}`
}

function humanize(key: string) {
    return key
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

function MetricCard({
    title,
    value,
    change,
    icon: Icon,
    caption,
}: {
    title: string
    value: string
    change: number
    icon: React.ElementType
    caption: string
}) {
    const isPositive = change >= 0

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
        </Card>
    )
}

function ChartCard({
    title,
    subtitle,
    children,
    isEmpty,
}: {
    title: string
    subtitle: string
    children: React.ReactNode
    isEmpty: boolean
}) {
    return (
        <Card className="p-6 border-[#e6dcc8] bg-white">
            <div className="mb-6">
                <h2 className="text-lg font-bold text-[#2B1A12]">{title}</h2>
                <p className="text-sm text-[#8B4513]">{subtitle}</p>
            </div>
            {isEmpty ? (
                <div className="h-[280px] flex flex-col items-center justify-center text-center gap-2">
                    <BarChart3 className="w-8 h-8 text-[#e6dcc8]" />
                    <p className="text-sm text-[#8B4513]">No orders in this period yet</p>
                </div>
            ) : (
                children
            )}
        </Card>
    )
}

export default function AnalyticsPage() {
    const [days, setDays] = useState(30)
    const [data, setData] = useState<PlatformAnalytics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async (rangeDays: number) => {
        setLoading(true)
        setError(null)
        try {
            setData(await getPlatformAnalytics(rangeDays))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load analytics")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load(days)
    }, [days, load])

    const hasOrders = (data?.totals.orders ?? 0) > 0

    return (
        <div className="p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-[#2B1A12] mb-2">Platform Analytics</h1>
                    <p className="text-[#8B4513]">
                        Business intelligence across every cafe on CaféOS
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-white p-1 rounded-lg border border-[#e6dcc8]">
                        {RANGES.map((range) => (
                            <button
                                key={range.days}
                                onClick={() => setDays(range.days)}
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                                    days === range.days
                                        ? "bg-[#BF5700] text-white"
                                        : "text-[#8B4513] hover:text-[#2B1A12]"
                                }`}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => load(days)}
                        disabled={loading}
                        aria-label="Refresh analytics"
                        className="p-2 bg-white rounded-lg border border-[#e6dcc8] text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {error && (
                <Card className="p-6 border-red-200 bg-red-50 mb-8 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-900">Could not load analytics</p>
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
                            title="Gross Revenue"
                            value={formatCurrency(data.totals.revenue)}
                            change={data.growth.revenue}
                            icon={IndianRupee}
                            caption="vs previous period"
                        />
                        <MetricCard
                            title="Orders"
                            value={data.totals.orders.toLocaleString("en-IN")}
                            change={data.growth.orders}
                            icon={ShoppingBag}
                            caption="vs previous period"
                        />
                        <MetricCard
                            title="Avg Order Value"
                            value={formatCurrency(data.totals.avgOrderValue)}
                            change={data.growth.avgOrderValue}
                            icon={Activity}
                            caption="vs previous period"
                        />
                        <MetricCard
                            title="New Customers"
                            value={data.totals.customers.toLocaleString("en-IN")}
                            change={data.growth.customers}
                            icon={UserPlus}
                            caption="vs previous period"
                        />
                    </div>

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="flex items-center gap-3">
                            <Store className="w-5 h-5 text-[#BF5700]" />
                            <p className="text-sm text-[#8B4513]">
                                <span className="font-bold text-[#2B1A12]">
                                    {data.totals.activeCafes}
                                </span>{" "}
                                active of{" "}
                                <span className="font-bold text-[#2B1A12]">
                                    {data.totals.totalCafes}
                                </span>{" "}
                                cafes on the platform
                                <span className="mx-2 text-[#e6dcc8]">|</span>
                                <span
                                    className={`font-semibold ${data.growth.cafes >= 0 ? "text-green-600" : "text-red-600"}`}
                                >
                                    {data.growth.cafes >= 0 ? "+" : ""}
                                    {data.growth.cafes}%
                                </span>{" "}
                                new signups vs previous period
                            </p>
                        </div>
                    </Card>

                    <ChartCard
                        title="Revenue & Order Volume"
                        subtitle={`Daily totals across the last ${data.range.days} days`}
                        isEmpty={!hasOrders}
                    >
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={data.timeseries}>
                                <defs>
                                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#BF5700" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#BF5700" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e6dcc8" />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={formatDay}
                                    stroke="#8B4513"
                                    fontSize={12}
                                    minTickGap={24}
                                />
                                <YAxis
                                    stroke="#8B4513"
                                    fontSize={12}
                                    tickFormatter={formatCompactCurrency}
                                />
                                <Tooltip
                                    labelFormatter={(label) => formatDay(String(label))}
                                    formatter={(value: number, name) =>
                                        name === "revenue"
                                            ? [formatCurrency(value), "Revenue"]
                                            : [value, "Orders"]
                                    }
                                    contentStyle={{
                                        borderRadius: 8,
                                        border: "1px solid #e6dcc8",
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="#BF5700"
                                    strokeWidth={2}
                                    fill="url(#revenueFill)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <ChartCard
                            title="Peak Hours"
                            subtitle="Orders by hour of day, platform-wide"
                            isEmpty={!hasOrders}
                        >
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={data.hourly}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e6dcc8" />
                                    <XAxis
                                        dataKey="hour"
                                        tickFormatter={formatHour}
                                        stroke="#8B4513"
                                        fontSize={11}
                                        interval={2}
                                    />
                                    <YAxis stroke="#8B4513" fontSize={12} allowDecimals={false} />
                                    <Tooltip
                                        labelFormatter={(label) => formatHour(Number(label))}
                                        formatter={(value: number) => [value, "Orders"]}
                                        contentStyle={{
                                            borderRadius: 8,
                                            border: "1px solid #e6dcc8",
                                        }}
                                    />
                                    <Bar dataKey="orders" fill="#BF5700" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard
                            title="Order Channels"
                            subtitle="Where orders come from"
                            isEmpty={data.sourceMix.length === 0}
                        >
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={data.sourceMix}
                                        dataKey="orders"
                                        nameKey="key"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={2}
                                    >
                                        {data.sourceMix.map((entry, index) => (
                                            <Cell
                                                key={entry.key}
                                                fill={MIX_COLORS[index % MIX_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Legend formatter={(value) => humanize(String(value))} />
                                    <Tooltip
                                        formatter={(value: number, name) => [
                                            `${value} orders`,
                                            humanize(String(name)),
                                        ]}
                                        contentStyle={{
                                            borderRadius: 8,
                                            border: "1px solid #e6dcc8",
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <Card className="p-6 border-[#e6dcc8] bg-white">
                            <div className="mb-6">
                                <h2 className="text-lg font-bold text-[#2B1A12]">
                                    Top Performing Cafes
                                </h2>
                                <p className="text-sm text-[#8B4513]">
                                    Ranked by revenue in this period
                                </p>
                            </div>
                            {data.topCafes.length === 0 ? (
                                <p className="text-sm text-[#8B4513] py-8 text-center">
                                    No cafes on the platform yet
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {data.topCafes.map((cafe, index) => (
                                        <div
                                            key={cafe.id}
                                            className="flex items-center justify-between gap-4 py-3 border-b border-[#f0e9dd] last:border-0"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="w-7 h-7 shrink-0 rounded-full bg-[#BF5700]/10 text-[#BF5700] text-xs font-bold flex items-center justify-center">
                                                    {index + 1}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-[#2B1A12] truncate">
                                                        {cafe.name}
                                                    </p>
                                                    <p className="text-xs text-[#8B4513]">
                                                        {cafe.orders} orders
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="font-bold text-[#2B1A12] shrink-0">
                                                {formatCurrency(cafe.revenue)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        <Card className="p-6 border-[#e6dcc8] bg-white">
                            <div className="mb-6">
                                <h2 className="text-lg font-bold text-[#2B1A12]">Payment Methods</h2>
                                <p className="text-sm text-[#8B4513]">
                                    Share of orders and revenue collected
                                </p>
                            </div>
                            {data.paymentMix.length === 0 ? (
                                <p className="text-sm text-[#8B4513] py-8 text-center">
                                    No payments in this period yet
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {data.paymentMix.map((entry, index) => {
                                        const share =
                                            data.totals.orders > 0
                                                ? (entry.orders / data.totals.orders) * 100
                                                : 0
                                        return (
                                            <div key={entry.key}>
                                                <div className="flex justify-between text-sm mb-1.5">
                                                    <span className="font-medium text-[#2B1A12]">
                                                        {humanize(entry.key)}
                                                    </span>
                                                    <span className="text-[#8B4513]">
                                                        {formatCurrency(entry.revenue)} ·{" "}
                                                        {share.toFixed(0)}%
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-[#f8f5f2] rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{
                                                            width: `${share}%`,
                                                            backgroundColor:
                                                                MIX_COLORS[index % MIX_COLORS.length],
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
