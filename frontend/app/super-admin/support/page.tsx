"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Inbox,
    Lock,
    MessageSquare,
    RefreshCw,
    Send,
    Timer,
} from "lucide-react"
import {
    getSupportStats,
    getSupportTicket,
    getSupportTickets,
    replyToTicket,
    updateTicket,
    type SupportStats,
    type TicketDetail,
    type TicketListRow,
    type TicketPriority,
    type TicketStatus,
} from "@/lib/api"

const STATUS_FILTERS: { label: string; value: TicketStatus | "ALL" }[] = [
    { label: "All", value: "ALL" },
    { label: "Open", value: "OPEN" },
    { label: "Pending", value: "PENDING" },
    { label: "Resolved", value: "RESOLVED" },
    { label: "Closed", value: "CLOSED" },
]

const STATUS_STYLES: Record<string, string> = {
    OPEN: "bg-red-100 text-red-800",
    PENDING: "bg-amber-100 text-amber-800",
    RESOLVED: "bg-green-100 text-green-800",
    CLOSED: "bg-slate-200 text-slate-700",
}

const PRIORITY_STYLES: Record<string, string> = {
    URGENT: "bg-red-600 text-white",
    HIGH: "bg-orange-100 text-orange-800",
    NORMAL: "bg-slate-100 text-slate-600",
    LOW: "bg-slate-50 text-slate-500",
}

const PRIORITIES: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"]

function humanize(key: string) {
    return key
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
    })
}

function relativeTime(iso: string) {
    const diffMs = Date.now() - new Date(iso).getTime()
    const hours = Math.floor(diffMs / (60 * 60 * 1000))
    if (hours < 1) return "just now"
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return days === 1 ? "1 day ago" : `${days} days ago`
}

function Pill({ value, styles }: { value: string; styles: Record<string, string> }) {
    return (
        <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                styles[value] ?? "bg-slate-100 text-slate-600"
            }`}
        >
            {humanize(value)}
        </span>
    )
}

function StatTile({
    label,
    value,
    icon: Icon,
    tone = "default",
}: {
    label: string
    value: string
    icon: React.ElementType
    tone?: "default" | "alert"
}) {
    return (
        <Card
            className={`p-4 bg-white ${tone === "alert" && value !== "0" ? "border-red-300" : "border-[#e6dcc8]"}`}
        >
            <div className="flex items-center gap-3">
                <Icon
                    className={`w-5 h-5 shrink-0 ${tone === "alert" && value !== "0" ? "text-red-600" : "text-[#BF5700]"}`}
                />
                <div className="min-w-0">
                    <p className="text-2xl font-bold text-[#2B1A12] leading-tight">{value}</p>
                    <p className="text-xs text-[#8B4513]">{label}</p>
                </div>
            </div>
        </Card>
    )
}

export default function SupportPage() {
    const [tickets, setTickets] = useState<TicketListRow[]>([])
    const [stats, setStats] = useState<SupportStats | null>(null)
    const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("ALL")
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [detail, setDetail] = useState<TicketDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [detailLoading, setDetailLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [replyBody, setReplyBody] = useState("")
    const [internalNote, setInternalNote] = useState(false)
    const [busy, setBusy] = useState(false)

    const loadList = useCallback(async (status: TicketStatus | "ALL") => {
        setLoading(true)
        setError(null)
        try {
            const [rows, nextStats] = await Promise.all([
                getSupportTickets(status === "ALL" ? {} : { status }),
                getSupportStats(),
            ])
            setTickets(rows)
            setStats(nextStats)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load support inbox")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadList(statusFilter)
    }, [statusFilter, loadList])

    const loadDetail = useCallback(async (id: string) => {
        setDetailLoading(true)
        try {
            setDetail(await getSupportTicket(id))
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not open ticket")
        } finally {
            setDetailLoading(false)
        }
    }, [])

    useEffect(() => {
        if (selectedId) loadDetail(selectedId)
        else setDetail(null)
    }, [selectedId, loadDetail])

    const refreshBoth = async () => {
        await loadList(statusFilter)
        if (selectedId) await loadDetail(selectedId)
    }

    const handleReply = async () => {
        if (!detail || replyBody.trim().length === 0) return
        setBusy(true)
        try {
            await replyToTicket(detail.id, replyBody.trim(), internalNote)
            setReplyBody("")
            toast.success(internalNote ? "Internal note added" : "Reply sent")
            await refreshBoth()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not send reply")
        } finally {
            setBusy(false)
        }
    }

    const handleUpdate = async (patch: { status?: TicketStatus; priority?: TicketPriority }) => {
        if (!detail) return
        setBusy(true)
        try {
            await updateTicket(detail.id, patch)
            toast.success("Ticket updated")
            await refreshBoth()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not update ticket")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-[#2B1A12] mb-2">Support</h1>
                    <p className="text-[#8B4513]">Triage and answer tickets raised by cafes</p>
                </div>
                <button
                    onClick={refreshBoth}
                    disabled={loading}
                    aria-label="Refresh support inbox"
                    className="p-2 bg-white rounded-lg border border-[#e6dcc8] text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50 self-start"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {error && (
                <Card className="p-6 border-red-200 bg-red-50 mb-8 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-900">Could not load support inbox</p>
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                </Card>
            )}

            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                    <StatTile label="Unresolved" value={String(stats.unresolved)} icon={Inbox} />
                    <StatTile
                        label="Urgent open"
                        value={String(stats.urgentUnresolved)}
                        icon={AlertCircle}
                        tone="alert"
                    />
                    <StatTile
                        label="Awaiting first reply"
                        value={String(stats.awaitingFirstReply)}
                        icon={Clock}
                        tone="alert"
                    />
                    <StatTile
                        label="Avg first response"
                        value={
                            stats.avgFirstResponseHours === null
                                ? "—"
                                : `${stats.avgFirstResponseHours}h`
                        }
                        icon={Timer}
                    />
                    <StatTile
                        label="Resolved this week"
                        value={String(stats.resolvedLast7Days)}
                        icon={CheckCircle2}
                    />
                </div>
            )}

            <div className="flex bg-white p-1 rounded-lg border border-[#e6dcc8] mb-6 w-fit">
                {STATUS_FILTERS.map((filter) => (
                    <button
                        key={filter.value}
                        onClick={() => setStatusFilter(filter.value)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                            statusFilter === filter.value
                                ? "bg-[#BF5700] text-white"
                                : "text-[#8B4513] hover:text-[#2B1A12]"
                        }`}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                <Card className="xl:col-span-2 p-0 border-[#e6dcc8] bg-white overflow-hidden">
                    <div className="p-4 border-b border-[#e6dcc8]">
                        <h2 className="font-bold text-[#2B1A12]">
                            Inbox
                            <span className="text-[#8B4513] font-normal text-sm">
                                {" "}
                                · {tickets.length}
                            </span>
                        </h2>
                    </div>
                    {loading && tickets.length === 0 ? (
                        <div className="p-4 space-y-3">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="h-16 animate-pulse bg-[#f8f5f2] rounded"
                                />
                            ))}
                        </div>
                    ) : tickets.length === 0 ? (
                        <div className="p-10 flex flex-col items-center gap-2 text-center">
                            <Inbox className="w-8 h-8 text-[#e6dcc8]" />
                            <p className="text-sm text-[#8B4513]">
                                {statusFilter === "ALL"
                                    ? "No tickets yet"
                                    : `No ${statusFilter.toLowerCase()} tickets`}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-[#f0e9dd] max-h-[640px] overflow-y-auto">
                            {tickets.map((row) => (
                                <button
                                    key={row.id}
                                    onClick={() => setSelectedId(row.id)}
                                    className={`w-full text-left p-4 hover:bg-[#f8f5f2] transition-colors ${
                                        selectedId === row.id ? "bg-[#f8f5f2]" : ""
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <p className="font-semibold text-[#2B1A12] text-sm line-clamp-1">
                                            {row.subject}
                                        </p>
                                        <Pill value={row.priority} styles={PRIORITY_STYLES} />
                                    </div>
                                    <p className="text-xs text-[#8B4513] mb-2">
                                        {row.shopName} · {relativeTime(row.lastActivityAt)}
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Pill value={row.status} styles={STATUS_STYLES} />
                                        {row.awaitingFirstReply && (
                                            <span className="text-xs font-semibold text-red-700">
                                                Never answered
                                            </span>
                                        )}
                                        {row.replyCount > 0 && (
                                            <span className="flex items-center gap-1 text-xs text-[#8B4513]">
                                                <MessageSquare className="w-3 h-3" />
                                                {row.replyCount}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </Card>

                <Card className="xl:col-span-3 p-6 border-[#e6dcc8] bg-white">
                    {!selectedId ? (
                        <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-2 text-center">
                            <MessageSquare className="w-8 h-8 text-[#e6dcc8]" />
                            <p className="text-sm text-[#8B4513]">
                                Select a ticket to read and reply
                            </p>
                        </div>
                    ) : detailLoading && !detail ? (
                        <div className="h-64 animate-pulse bg-[#f8f5f2] rounded" />
                    ) : detail ? (
                        <div className="space-y-6">
                            <div>
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <h2 className="text-xl font-bold text-[#2B1A12]">
                                        {detail.subject}
                                    </h2>
                                    <Pill value={detail.status} styles={STATUS_STYLES} />
                                </div>
                                <p className="text-sm text-[#8B4513]">
                                    {detail.shopName} · {humanize(detail.category)} · opened{" "}
                                    {formatDateTime(detail.createdAt)}
                                    {detail.contactEmail ? ` · ${detail.contactEmail}` : ""}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-[#8B4513] font-semibold uppercase tracking-wider">
                                    Priority
                                </span>
                                {PRIORITIES.map((priority) => (
                                    <button
                                        key={priority}
                                        onClick={() => handleUpdate({ priority })}
                                        disabled={busy || detail.priority === priority}
                                        className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-100 ${
                                            detail.priority === priority
                                                ? PRIORITY_STYLES[priority]
                                                : "text-[#8B4513] hover:text-[#2B1A12] border border-[#e6dcc8]"
                                        }`}
                                    >
                                        {humanize(priority)}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-3">
                                <div className="p-4 rounded-lg bg-[#f8f5f2] border border-[#e6dcc8]">
                                    <p className="text-xs font-semibold text-[#8B4513] mb-1">
                                        {detail.shopName} · {formatDateTime(detail.createdAt)}
                                    </p>
                                    <p className="text-sm text-[#2B1A12] whitespace-pre-wrap">
                                        {detail.body}
                                    </p>
                                </div>

                                {detail.replies.map((reply) => (
                                    <div
                                        key={reply.id}
                                        className={`p-4 rounded-lg border ${
                                            reply.isInternal
                                                ? "bg-amber-50 border-amber-200"
                                                : "bg-white border-[#e6dcc8]"
                                        }`}
                                    >
                                        <p className="text-xs font-semibold text-[#8B4513] mb-1 flex items-center gap-1.5">
                                            {reply.isInternal && (
                                                <>
                                                    <Lock className="w-3 h-3" />
                                                    Internal note ·
                                                </>
                                            )}
                                            {humanize(reply.authorRole)} ·{" "}
                                            {formatDateTime(reply.createdAt)}
                                        </p>
                                        <p className="text-sm text-[#2B1A12] whitespace-pre-wrap">
                                            {reply.body}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-3 pt-2 border-t border-[#e6dcc8]">
                                <Textarea
                                    value={replyBody}
                                    onChange={(event) => setReplyBody(event.target.value)}
                                    placeholder={
                                        internalNote
                                            ? "Note for the platform team only…"
                                            : "Reply to the cafe…"
                                    }
                                    rows={4}
                                    className="bg-white"
                                />
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <label className="flex items-center gap-2 text-sm text-[#8B4513] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={internalNote}
                                            onChange={(event) =>
                                                setInternalNote(event.target.checked)
                                            }
                                            className="accent-[#BF5700]"
                                        />
                                        Internal note (hidden from the cafe, does not count as a
                                        response)
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {detail.status !== "RESOLVED" &&
                                            detail.status !== "CLOSED" && (
                                                <button
                                                    onClick={() =>
                                                        handleUpdate({ status: "RESOLVED" })
                                                    }
                                                    disabled={busy}
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#e6dcc8] text-sm font-semibold text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    Resolve
                                                </button>
                                            )}
                                        {(detail.status === "RESOLVED" ||
                                            detail.status === "CLOSED") && (
                                            <button
                                                onClick={() => handleUpdate({ status: "OPEN" })}
                                                disabled={busy}
                                                className="px-3 py-2 rounded-lg border border-[#e6dcc8] text-sm font-semibold text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50"
                                            >
                                                Reopen
                                            </button>
                                        )}
                                        <button
                                            onClick={handleReply}
                                            disabled={busy || replyBody.trim().length === 0}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#BF5700] text-white text-sm font-semibold hover:bg-[#A04000] disabled:opacity-50"
                                        >
                                            <Send className="w-4 h-4" />
                                            {busy ? "Sending…" : internalNote ? "Add note" : "Send reply"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </Card>
            </div>
        </div>
    )
}
