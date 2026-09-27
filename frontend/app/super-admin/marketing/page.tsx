"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
    AlertCircle,
    Filter,
    IndianRupee,
    Megaphone,
    RefreshCw,
    Send,
    ShoppingBag,
    Target,
    Trash2,
    Users,
} from "lucide-react"
import {
    createAnnouncement,
    deleteAnnouncement,
    getMarketingOverview,
    updateAnnouncement,
    type AnnouncementAudience,
    type AnnouncementRow,
    type MarketingOverview,
} from "@/lib/api"

const AUDIENCES: { value: AnnouncementAudience; label: string; hint: string }[] = [
    { value: "ALL", label: "All cafes", hint: "Every active cafe" },
    { value: "TRIAL", label: "On trial", hint: "Cafes still in their trial" },
    { value: "ACTIVE", label: "Paying", hint: "Cafes on an active subscription" },
    { value: "PAST_DUE", label: "Past due", hint: "Cafes behind on payment" },
]

const STATUS_STYLES: Record<string, string> = {
    PUBLISHED: "bg-green-100 text-green-800",
    DRAFT: "bg-slate-100 text-slate-600",
    ACTIVE: "bg-green-100 text-green-800",
    PAUSED: "bg-amber-100 text-amber-800",
    COMPLETED: "bg-blue-100 text-blue-800",
}

function formatCurrency(value: number) {
    return `₹${Math.round(value).toLocaleString("en-IN")}`
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

function Pill({ value }: { value: string }) {
    return (
        <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                STATUS_STYLES[value] ?? "bg-slate-100 text-slate-600"
            }`}
        >
            {humanize(value)}
        </span>
    )
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

export default function MarketingPage() {
    const [data, setData] = useState<MarketingOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)

    const [title, setTitle] = useState("")
    const [body, setBody] = useState("")
    const [audience, setAudience] = useState<AnnouncementAudience>("ALL")
    const [submitting, setSubmitting] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await getMarketingOverview())
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load marketing overview")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const handleCreate = async (status: "DRAFT" | "PUBLISHED") => {
        if (title.trim().length < 3 || body.trim().length === 0) {
            toast.error("A title of at least 3 characters and a message are required")
            return
        }
        setSubmitting(true)
        try {
            await createAnnouncement({
                title: title.trim(),
                body: body.trim(),
                audience,
                status,
            })
            setTitle("")
            setBody("")
            setAudience("ALL")
            toast.success(status === "PUBLISHED" ? "Announcement published" : "Draft saved")
            await load()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save announcement")
        } finally {
            setSubmitting(false)
        }
    }

    const handleToggle = async (row: AnnouncementRow) => {
        setBusyId(row.id)
        try {
            const next = row.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"
            await updateAnnouncement(row.id, { status: next })
            toast.success(next === "PUBLISHED" ? "Published" : "Moved back to draft")
            await load()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not update announcement")
        } finally {
            setBusyId(null)
        }
    }

    const handleDelete = async (row: AnnouncementRow) => {
        setBusyId(row.id)
        try {
            await deleteAnnouncement(row.id)
            toast.success("Announcement deleted")
            await load()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not delete announcement")
        } finally {
            setBusyId(null)
        }
    }

    const selectedAudience = AUDIENCES.find((option) => option.value === audience)

    return (
        <div className="p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-[#2B1A12] mb-2">Marketing</h1>
                    <p className="text-[#8B4513]">
                        Broadcast to cafes and track where orders actually come from
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    aria-label="Refresh marketing overview"
                    className="p-2 bg-white rounded-lg border border-[#e6dcc8] text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50 self-start"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {error && (
                <Card className="p-6 border-red-200 bg-red-50 mb-8 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-900">
                            Could not load marketing overview
                        </p>
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
                            title="Attributed Orders"
                            value={data.attribution.attributedOrders.toLocaleString("en-IN")}
                            caption={`Last ${data.attribution.windowDays} days`}
                            icon={ShoppingBag}
                        />
                        <MetricCard
                            title="Attributed Revenue"
                            value={formatCurrency(data.attribution.attributedRevenue)}
                            caption="Cancelled orders excluded"
                            icon={IndianRupee}
                        />
                        <MetricCard
                            title="Attribution Coverage"
                            value={`${data.attribution.coverage}%`}
                            caption="Share of orders with a known source"
                            icon={Target}
                        />
                        <MetricCard
                            title="Cafe Campaigns"
                            value={String(data.campaigns.total)}
                            caption={`${data.campaigns.byStatus[0]?.count ?? 0} ${
                                data.campaigns.byStatus[0]
                                    ? humanize(data.campaigns.byStatus[0].key).toLowerCase()
                                    : "none yet"
                            }`}
                            icon={Megaphone}
                        />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <Card className="p-6 border-[#e6dcc8] bg-white">
                            <div className="mb-6">
                                <h2 className="text-lg font-bold text-[#2B1A12]">
                                    New Announcement
                                </h2>
                                <p className="text-sm text-[#8B4513]">
                                    Send a message to cafe owners on the platform
                                </p>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="announcementTitle" className="text-[#2B1A12]">
                                        Title
                                    </Label>
                                    <Input
                                        id="announcementTitle"
                                        className="bg-white"
                                        value={title}
                                        onChange={(event) => setTitle(event.target.value)}
                                        placeholder="e.g. New POS shortcuts are live"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="announcementBody" className="text-[#2B1A12]">
                                        Message
                                    </Label>
                                    <Textarea
                                        id="announcementBody"
                                        className="bg-white"
                                        rows={5}
                                        value={body}
                                        onChange={(event) => setBody(event.target.value)}
                                        placeholder="What do cafe owners need to know?"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[#2B1A12]">Audience</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {AUDIENCES.map((option) => (
                                            <button
                                                key={option.value}
                                                onClick={() => setAudience(option.value)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                                    audience === option.value
                                                        ? "bg-[#BF5700] text-white"
                                                        : "border border-[#e6dcc8] text-[#8B4513] hover:text-[#2B1A12]"
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    {selectedAudience && (
                                        <p className="text-xs text-[#8B4513]">
                                            {selectedAudience.hint}
                                        </p>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pt-2">
                                    <button
                                        onClick={() => handleCreate("PUBLISHED")}
                                        disabled={submitting}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#BF5700] text-white text-sm font-semibold hover:bg-[#A04000] disabled:opacity-50"
                                    >
                                        <Send className="w-4 h-4" />
                                        {submitting ? "Saving…" : "Publish"}
                                    </button>
                                    <button
                                        onClick={() => handleCreate("DRAFT")}
                                        disabled={submitting}
                                        className="px-4 py-2 rounded-lg border border-[#e6dcc8] text-sm font-semibold text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50"
                                    >
                                        Save as draft
                                    </button>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-6 border-[#e6dcc8] bg-white">
                            <div className="mb-6">
                                <h2 className="text-lg font-bold text-[#2B1A12]">
                                    Order Sources
                                </h2>
                                <p className="text-sm text-[#8B4513]">
                                    Attributed revenue by channel, last{" "}
                                    {data.attribution.windowDays} days
                                </p>
                            </div>
                            {data.attribution.bySource.length === 0 ? (
                                <div className="py-10 flex flex-col items-center gap-2 text-center">
                                    <Filter className="w-8 h-8 text-[#e6dcc8]" />
                                    <p className="text-sm text-[#8B4513]">
                                        No attributed orders in this period
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {data.attribution.bySource.map((entry) => {
                                        const share =
                                            data.attribution.attributedRevenue > 0
                                                ? (entry.revenue /
                                                    data.attribution.attributedRevenue) *
                                                100
                                                : 0
                                        return (
                                            <div key={entry.key}>
                                                <div className="flex justify-between text-sm mb-1.5">
                                                    <span className="font-medium text-[#2B1A12]">
                                                        {humanize(entry.key)}
                                                        <span className="text-[#8B4513] font-normal">
                                                            {" "}
                                                            · {entry.orders} order
                                                            {entry.orders === 1 ? "" : "s"}
                                                        </span>
                                                    </span>
                                                    <span className="text-[#8B4513]">
                                                        {formatCurrency(entry.revenue)} ·{" "}
                                                        {share.toFixed(0)}%
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-[#f8f5f2] rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-[#BF5700]"
                                                        style={{ width: `${share}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </Card>
                    </div>

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">Announcements</h2>
                            <p className="text-sm text-[#8B4513]">
                                Reach is the number of cafes currently matching each audience
                            </p>
                        </div>
                        {data.announcements.length === 0 ? (
                            <div className="py-10 flex flex-col items-center gap-2 text-center">
                                <Megaphone className="w-8 h-8 text-[#e6dcc8]" />
                                <p className="text-sm text-[#8B4513]">
                                    Nothing sent yet. Write your first announcement above.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {data.announcements.map((row) => (
                                    <div
                                        key={row.id}
                                        className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 py-4 border-b border-[#f0e9dd] last:border-0"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <p className="font-semibold text-[#2B1A12]">
                                                    {row.title}
                                                </p>
                                                <Pill value={row.status} />
                                            </div>
                                            <p className="text-sm text-[#8B4513] line-clamp-2 mb-1">
                                                {row.body}
                                            </p>
                                            <p className="text-xs text-[#8B4513] flex items-center gap-1.5 flex-wrap">
                                                <Users className="w-3 h-3" />
                                                {humanize(row.audience)} · {row.reach} cafe
                                                {row.reach === 1 ? "" : "s"}
                                                {row.status === "PUBLISHED"
                                                    ? ` · published ${formatDate(row.publishedAt)}`
                                                    : ` · created ${formatDate(row.createdAt)}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => handleToggle(row)}
                                                disabled={busyId === row.id}
                                                className="px-3 py-1.5 rounded-lg border border-[#e6dcc8] text-sm font-semibold text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50"
                                            >
                                                {row.status === "PUBLISHED"
                                                    ? "Unpublish"
                                                    : "Publish"}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(row)}
                                                disabled={busyId === row.id}
                                                aria-label={`Delete ${row.title}`}
                                                className="p-2 rounded-lg border border-[#e6dcc8] text-[#8B4513] hover:text-red-600 disabled:opacity-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">
                                Recent Cafe Campaigns
                            </h2>
                            <p className="text-sm text-[#8B4513]">
                                Campaigns individual cafes are running
                            </p>
                        </div>
                        {data.campaigns.recent.length === 0 ? (
                            <p className="text-sm text-[#8B4513] py-8 text-center">
                                No cafe has created a campaign yet
                            </p>
                        ) : (
                            <div className="overflow-x-auto -mx-6 px-6">
                                <table className="w-full text-sm min-w-[560px]">
                                    <thead>
                                        <tr className="text-left text-[#8B4513] border-b border-[#e6dcc8]">
                                            <th className="pb-3 font-semibold">Campaign</th>
                                            <th className="pb-3 font-semibold">Cafe</th>
                                            <th className="pb-3 font-semibold">Type</th>
                                            <th className="pb-3 font-semibold">Status</th>
                                            <th className="pb-3 font-semibold">Created</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.campaigns.recent.map((row) => (
                                            <tr
                                                key={row.id}
                                                className="border-b border-[#f0e9dd] last:border-0"
                                            >
                                                <td className="py-3 font-semibold text-[#2B1A12]">
                                                    {row.name}
                                                </td>
                                                <td className="py-3 text-[#8B4513]">
                                                    {row.shopName}
                                                </td>
                                                <td className="py-3 text-[#8B4513]">
                                                    {humanize(row.type)}
                                                </td>
                                                <td className="py-3">
                                                    <Pill value={row.status} />
                                                </td>
                                                <td className="py-3 text-[#8B4513]">
                                                    {formatDate(row.createdAt)}
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
