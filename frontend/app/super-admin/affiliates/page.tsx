"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { toast } from "sonner"
import {
    AlertCircle,
    BadgeCheck,
    Check,
    Coins,
    RefreshCw,
    Store,
    Users,
    Wallet,
    X,
} from "lucide-react"
import {
    approvePayout,
    getAffiliateOverview,
    rejectPayout,
    type AffiliateOverview,
    type PayoutRow,
} from "@/lib/api"

const PAYOUT_STATUS_STYLES: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    PAID: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
}

function formatCurrency(value: number) {
    return `₹${Math.round(value).toLocaleString("en-IN")}`
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    })
}

function humanize(key: string) {
    return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
}

function MetricCard({
    title,
    value,
    caption,
    icon: Icon,
}: {
    title: string
    value: string
    caption: string
    icon: React.ElementType
}) {
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
            <p className="text-sm text-[#8B4513]">{caption}</p>
        </Card>
    )
}

export default function AffiliatesPage() {
    const [data, setData] = useState<AffiliateOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pendingId, setPendingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await getAffiliateOverview())
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load affiliates")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const handlePayout = async (payout: PayoutRow, action: "approve" | "reject") => {
        setPendingId(payout.id)
        try {
            if (action === "approve") {
                const result = await approvePayout(payout.id)
                toast.success(
                    `Paid ${formatCurrency(payout.amount)} to ${payout.affiliateName}`,
                    { description: `Remaining balance ${formatCurrency(result.remainingBalance)}` },
                )
            } else {
                await rejectPayout(payout.id)
                toast.success(`Declined payout to ${payout.affiliateName}`, {
                    description: "The balance stays claimable.",
                })
            }
            // Refetch so balances and totals reflect the settlement.
            await load()
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : `Could not ${action} the payout`,
            )
        } finally {
            setPendingId(null)
        }
    }

    return (
        <div className="p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-[#2B1A12] mb-2">Affiliates</h1>
                    <p className="text-[#8B4513]">
                        Partner performance, balances and payout approvals
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    aria-label="Refresh affiliates"
                    className="p-2 bg-white rounded-lg border border-[#e6dcc8] text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50 self-start"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {error && (
                <Card className="p-6 border-red-200 bg-red-50 mb-8 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-900">Could not load affiliates</p>
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
                            title="Affiliates"
                            value={String(data.totals.affiliates)}
                            caption={`${data.totals.producingAffiliates} with a converted cafe`}
                            icon={Users}
                        />
                        <MetricCard
                            title="Cafes Referred"
                            value={String(data.totals.referrals)}
                            caption={`${data.totals.convertedReferrals} converted · ${data.totals.trialReferrals} on trial`}
                            icon={Store}
                        />
                        <MetricCard
                            title="Awaiting Payout"
                            value={formatCurrency(data.totals.pendingPayoutAmount)}
                            caption={`${data.pendingPayouts.length} request${data.pendingPayouts.length === 1 ? "" : "s"} to review`}
                            icon={Wallet}
                        />
                        <MetricCard
                            title="Paid to Date"
                            value={formatCurrency(data.totals.paidOutAmount)}
                            caption={`${formatCurrency(data.totals.outstandingBalance)} unpaid balance held`}
                            icon={Coins}
                        />
                    </div>

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">Payout Requests</h2>
                            <p className="text-sm text-[#8B4513]">
                                Approving settles the payout and draws it down from the
                                affiliate&apos;s balance
                            </p>
                        </div>
                        {data.pendingPayouts.length === 0 ? (
                            <div className="py-8 flex flex-col items-center gap-2 text-center">
                                <BadgeCheck className="w-8 h-8 text-[#e6dcc8]" />
                                <p className="text-sm text-[#8B4513]">
                                    No payouts waiting for approval
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {data.pendingPayouts.map((payout) => {
                                    const busy = pendingId === payout.id
                                    return (
                                        <div
                                            key={payout.id}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-[#f0e9dd] last:border-0"
                                        >
                                            <div className="min-w-0">
                                                <p className="font-semibold text-[#2B1A12] truncate">
                                                    {payout.affiliateName}
                                                </p>
                                                <p className="text-xs text-[#8B4513]">
                                                    {payout.affiliateCode} · requested{" "}
                                                    {formatDate(payout.createdAt)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="font-bold text-[#2B1A12]">
                                                    {formatCurrency(payout.amount)}
                                                </span>
                                                <button
                                                    onClick={() => handlePayout(payout, "approve")}
                                                    disabled={busy}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#BF5700] text-white text-sm font-semibold hover:bg-[#A04000] disabled:opacity-50"
                                                >
                                                    <Check className="w-4 h-4" />
                                                    {busy ? "Working…" : "Approve"}
                                                </button>
                                                <button
                                                    onClick={() => handlePayout(payout, "reject")}
                                                    disabled={busy}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e6dcc8] text-[#8B4513] text-sm font-semibold hover:text-[#2B1A12] disabled:opacity-50"
                                                >
                                                    <X className="w-4 h-4" />
                                                    Decline
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </Card>

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">Partner Performance</h2>
                            <p className="text-sm text-[#8B4513]">
                                Ranked by converted cafes, then unpaid balance
                            </p>
                        </div>
                        {data.affiliates.length === 0 ? (
                            <p className="text-sm text-[#8B4513] py-8 text-center">
                                No affiliate accounts yet
                            </p>
                        ) : (
                            <div className="overflow-x-auto -mx-6 px-6">
                                <table className="w-full text-sm min-w-[720px]">
                                    <thead>
                                        <tr className="text-left text-[#8B4513] border-b border-[#e6dcc8]">
                                            <th className="pb-3 font-semibold">Affiliate</th>
                                            <th className="pb-3 font-semibold">Code</th>
                                            <th className="pb-3 font-semibold text-right">Cafes</th>
                                            <th className="pb-3 font-semibold text-right">
                                                Per cafe
                                            </th>
                                            <th className="pb-3 font-semibold text-right">
                                                Balance
                                            </th>
                                            <th className="pb-3 font-semibold text-right">Paid</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.affiliates.map((affiliate) => (
                                            <tr
                                                key={affiliate.id}
                                                className="border-b border-[#f0e9dd] last:border-0"
                                            >
                                                <td className="py-3">
                                                    <p className="font-semibold text-[#2B1A12]">
                                                        {affiliate.name}
                                                    </p>
                                                    <p className="text-xs text-[#8B4513]">
                                                        {affiliate.email ?? affiliate.phone}
                                                    </p>
                                                </td>
                                                <td className="py-3">
                                                    <code className="text-xs bg-[#f8f5f2] px-2 py-1 rounded text-[#8B4513]">
                                                        {affiliate.code}
                                                    </code>
                                                </td>
                                                <td className="py-3 text-right">
                                                    <span className="font-semibold text-[#2B1A12]">
                                                        {affiliate.referrals.converted}
                                                    </span>
                                                    <span className="text-[#8B4513]">
                                                        {" "}
                                                        / {affiliate.referrals.total}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-right text-[#8B4513]">
                                                    {formatCurrency(affiliate.commissionRate)}
                                                </td>
                                                <td className="py-3 text-right font-semibold text-[#2B1A12]">
                                                    {formatCurrency(affiliate.balance)}
                                                </td>
                                                <td className="py-3 text-right text-[#8B4513]">
                                                    {formatCurrency(affiliate.paidToDate)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">Payout History</h2>
                            <p className="text-sm text-[#8B4513]">Most recent settlements</p>
                        </div>
                        {data.recentPayouts.length === 0 ? (
                            <p className="text-sm text-[#8B4513] py-8 text-center">
                                No payouts settled yet
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {data.recentPayouts.map((payout) => (
                                    <div
                                        key={payout.id}
                                        className="flex items-center justify-between gap-4 py-3 border-b border-[#f0e9dd] last:border-0"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-semibold text-[#2B1A12] truncate">
                                                {payout.affiliateName}
                                            </p>
                                            <p className="text-xs text-[#8B4513]">
                                                {formatDate(payout.createdAt)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    PAYOUT_STATUS_STYLES[payout.status] ??
                                                    "bg-slate-100 text-slate-600"
                                                }`}
                                            >
                                                {humanize(payout.status)}
                                            </span>
                                            <span className="font-bold text-[#2B1A12]">
                                                {formatCurrency(payout.amount)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            ) : null}
        </div>
    )
}
