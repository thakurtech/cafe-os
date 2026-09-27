"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import Link from "next/link"
import {
    TrendingUp,
    Store,
    Users,
    DollarSign,
    ArrowUpRight,
    ArrowDownRight,
    Activity,
    Plus
} from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { getPlatformStats, getRevenueOverview, getShops } from "@/lib/api"

function MetricCard({ title, value, change, icon: Icon, prefix = "", loading = false }: any) {
    const isPositive = change >= 0

    return (
        <Card className="p-6 border-[#e6dcc8] bg-white hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="text-sm text-[#8B4513] font-medium">{title}</p>
                    <h3 className="text-3xl font-bold text-[#2B1A12] mt-1">
                        {loading ? "..." : `${prefix}${value.toLocaleString()}`}
                    </h3>
                </div>
                <div className="w-12 h-12 bg-[#BF5700]/10 rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6 text-[#BF5700]" />
                </div>
            </div>
            <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                <span className="font-semibold">{Math.abs(change)}%</span>
                <span className="text-[#8B4513]">vs last month</span>
            </div>
        </Card>
    )
}

export default function SuperAdminDashboard() {
    const [stats, setStats] = useState({
        totalCafes: 0,
        activeUsers: 0,
        ordersToday: 0,
        mrr: 0,
        mrrGrowth: 0,
        cafeGrowth: 0,
        userGrowth: 0,
        orderGrowth: 0,
    })
    const [mrrTrend, setMrrTrend] = useState<{ month: string; mrr: number }[]>([])
    const [recentCafes, setRecentCafes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            try {
                const [platformStats, revenue] = await Promise.all([
                    getPlatformStats(),
                    getRevenueOverview(),
                ])
                if (cancelled) return
                setStats(platformStats)
                setMrrTrend(revenue.mrrTrend)
            } catch (error) {
                console.error('Failed to fetch platform stats:', error)
            }

            try {
                const shops = await getShops()
                if (cancelled) return
                const sorted = [...shops].sort(
                    (a: any, b: any) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
                setRecentCafes(sorted.slice(0, 5))
            } catch (error) {
                console.error('Failed to fetch recent cafes:', error)
            }

            if (!cancelled) setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [])

    // Real committed MRR over the last 12 months, from the revenue endpoint.
    const chartData = mrrTrend

    return (
        <div className="p-8">
            {/* Header */}
            <div className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-[#2B1A12] mb-2">Platform Overview</h1>
                    <p className="text-[#8B4513]">Welcome back, Sumit. Here's what's happening with CaféOS today.</p>
                </div>
                <Link href="/super-admin/cafes/new">
                    <button className="bg-[#BF5700] hover:bg-[#A04000] text-white px-4 py-2 rounded-lg flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        New Cafe
                    </button>
                </Link>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <MetricCard
                    title="Monthly Recurring Revenue"
                    value={stats.mrr}
                    change={stats.mrrGrowth}
                    icon={DollarSign}
                    prefix="₹"
                    loading={loading}
                />
                <MetricCard
                    title="Total Cafes"
                    value={stats.totalCafes}
                    change={stats.cafeGrowth}
                    icon={Store}
                    loading={loading}
                />
                <MetricCard
                    title="Active Users"
                    value={stats.activeUsers}
                    change={stats.userGrowth}
                    icon={Users}
                    loading={loading}
                />
                <MetricCard
                    title="Orders Today"
                    value={stats.ordersToday}
                    change={stats.orderGrowth}
                    icon={Activity}
                    loading={loading}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue Chart */}
                <Card className="lg:col-span-2 p-6 border-[#e6dcc8]">
                    <h2 className="text-xl font-bold text-[#2B1A12] mb-6">Revenue Overview</h2>
                    <div className="h-[300px] flex items-center justify-center">
                        {loading ? (
                            <p className="text-gray-400">Loading...</p>
                        ) : stats.totalCafes === 0 ? (
                            <div className="text-center">
                                <p className="text-gray-500 mb-4">No cafes yet. Add your first cafe to see revenue data!</p>
                                <Link href="/super-admin/cafes/new" className="text-[#BF5700] underline">
                                    Create First Cafe →
                                </Link>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorMRR" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#BF5700" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#BF5700" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e6dcc8" />
                                    <XAxis dataKey="month" stroke="#8B4513" />
                                    <YAxis stroke="#8B4513" />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#2B1A12',
                                            border: 'none',
                                            borderRadius: '8px',
                                            color: '#fff'
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="mrr"
                                        stroke="#BF5700"
                                        fillOpacity={1}
                                        fill="url(#colorMRR)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </Card>

                {/* Recent Signups - Real Data */}
                <Card className="p-6 border-[#e6dcc8]">
                    <h2 className="text-xl font-bold text-[#2B1A12] mb-6">Recent Cafes</h2>
                    <div className="space-y-4">
                        {loading ? (
                            <p className="text-gray-400 text-center py-4">Loading...</p>
                        ) : recentCafes.length === 0 ? (
                            <p className="text-gray-500 text-center py-4">No cafes yet</p>
                        ) : (
                            recentCafes.map((cafe: any) => (
                                <div key={cafe.id} className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-[#2B1A12] text-sm">{cafe.name}</h3>
                                        <p className="text-xs text-[#8B4513]">{cafe.address || 'No address'}</p>
                                        <p className="text-xs text-[#8B4513] mt-1">
                                            {new Date(cafe.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${cafe.isActive
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                        {cafe.isActive ? 'Active' : 'Pending'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                <Link href="/super-admin/cafes">
                    <Card className="p-6 border-[#e6dcc8] hover:shadow-lg transition-shadow cursor-pointer bg-gradient-to-br from-[#BF5700] to-[#8B4513] text-white">
                        <Store className="w-8 h-8 mb-4" />
                        <h3 className="font-bold text-lg mb-2">Manage Cafes</h3>
                        <p className="text-sm text-white/80">{stats.totalCafes} cafes on platform</p>
                    </Card>
                </Link>

                <Card className="p-6 border-[#e6dcc8] hover:shadow-lg transition-shadow cursor-pointer">
                    <Users className="w-8 h-8 mb-4 text-[#BF5700]" />
                    <h3 className="font-bold text-lg mb-2 text-[#2B1A12]">View Users</h3>
                    <p className="text-sm text-[#8B4513]">{stats.activeUsers} total users</p>
                </Card>

                <Card className="p-6 border-[#e6dcc8] hover:shadow-lg transition-shadow cursor-pointer">
                    <TrendingUp className="w-8 h-8 mb-4 text-[#BF5700]" />
                    <h3 className="font-bold text-lg mb-2 text-[#2B1A12]">View Analytics</h3>
                    <p className="text-sm text-[#8B4513]">Detailed platform insights</p>
                </Card>
            </div>
        </div>
    )
}
