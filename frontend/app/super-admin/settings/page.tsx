"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { AlertCircle, AlertTriangle, RotateCcw, Save, Settings2 } from "lucide-react"
import {
    getPlatformSettings,
    updatePlatformSettings,
    type PlatformSettings,
    type PlatformSettingsPatch,
} from "@/lib/api"

type Draft = Omit<PlatformSettings, "id" | "createdAt" | "updatedAt">

const NUMBER_FIELDS = [
    {
        key: "starterPriceMonthly" as const,
        label: "Starter plan (₹/month)",
        hint: "Charged to cafes on the entry plan",
    },
    {
        key: "growthPriceMonthly" as const,
        label: "Growth plan (₹/month)",
        hint: "Mid-tier plan price",
    },
    {
        key: "proPriceMonthly" as const,
        label: "Pro plan (₹/month)",
        hint: "Top-tier plan price",
    },
    {
        key: "defaultCommissionRate" as const,
        label: "Affiliate commission (₹ per cafe)",
        hint: "Default payout for each cafe an affiliate converts",
    },
    {
        key: "trialDays" as const,
        label: "Trial length (days)",
        hint: "Free days a new cafe gets before billing starts",
    },
    {
        key: "gracePeriodDays" as const,
        label: "Grace period (days)",
        hint: "How long a past-due cafe keeps access before suspension",
    },
]

const TOGGLE_FIELDS = [
    {
        key: "newSignupsEnabled" as const,
        label: "New cafe signups",
        hint: "Turn off to pause onboarding across the platform",
    },
    {
        key: "affiliateProgramEnabled" as const,
        label: "Affiliate program",
        hint: "Allow partners to refer and earn commission",
    },
    {
        key: "loyaltyEnabled" as const,
        label: "Loyalty rewards",
        hint: "Points and rewards for customers of every cafe",
    },
    {
        key: "gamesEnabled" as const,
        label: "Scratch cards & spin wheel",
        hint: "Gamified rewards on customer storefronts",
    },
]

function toDraft(settings: PlatformSettings): Draft {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { id, createdAt, updatedAt, ...draft } = settings
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return draft
}

export default function SettingsPage() {
    const [saved, setSaved] = useState<PlatformSettings | null>(null)
    const [draft, setDraft] = useState<Draft | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const settings = await getPlatformSettings()
            setSaved(settings)
            setDraft(toDraft(settings))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load settings")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    // Only the fields that actually changed get sent, so a PATCH stays minimal.
    const patch = useMemo<PlatformSettingsPatch>(() => {
        if (!saved || !draft) return {}
        const base = toDraft(saved)
        return Object.fromEntries(
            Object.entries(draft).filter(
                ([key, value]) => value !== base[key as keyof Draft],
            ),
        ) as PlatformSettingsPatch
    }, [saved, draft])

    const isDirty = Object.keys(patch).length > 0

    const setField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
        setDraft((current) => (current ? { ...current, [key]: value } : current))

    const handleSave = async () => {
        if (!isDirty) return
        setSaving(true)
        try {
            const updated = await updatePlatformSettings(patch)
            setSaved(updated)
            setDraft(toDraft(updated))
            toast.success("Platform settings saved")
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save settings")
        } finally {
            setSaving(false)
        }
    }

    const handleReset = () => {
        if (saved) setDraft(toDraft(saved))
    }

    return (
        <div className="p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-[#2B1A12] mb-2">Platform Settings</h1>
                    <p className="text-[#8B4513]">
                        Pricing, trials and feature switches applied across every cafe
                    </p>
                </div>
                <div className="flex items-center gap-2 self-start">
                    <button
                        onClick={handleReset}
                        disabled={!isDirty || saving}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#e6dcc8] bg-white text-sm font-semibold text-[#8B4513] hover:text-[#2B1A12] disabled:opacity-50"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Discard
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || saving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#BF5700] text-white text-sm font-semibold hover:bg-[#A04000] disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </div>

            {error && (
                <Card className="p-6 border-red-200 bg-red-50 mb-8 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-900">Could not load settings</p>
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                </Card>
            )}

            {loading && !draft ? (
                <div className="space-y-6">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Card key={index} className="p-6 border-[#e6dcc8] bg-white">
                            <div className="h-32 animate-pulse bg-[#f8f5f2] rounded" />
                        </Card>
                    ))}
                </div>
            ) : draft ? (
                <div className="space-y-6">
                    {isDirty && (
                        <Card className="p-4 border-[#BF5700]/30 bg-[#BF5700]/5 flex items-center gap-3">
                            <Settings2 className="w-5 h-5 text-[#BF5700] shrink-0" />
                            <p className="text-sm text-[#2B1A12]">
                                {Object.keys(patch).length} unsaved change
                                {Object.keys(patch).length === 1 ? "" : "s"}
                            </p>
                        </Card>
                    )}

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">Identity</h2>
                            <p className="text-sm text-[#8B4513]">
                                How the platform presents itself to cafes
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="platformName" className="text-[#2B1A12]">
                                    Platform name
                                </Label>
                                <Input
                                    id="platformName"
                                    className="bg-white"
                                    value={draft.platformName}
                                    onChange={(event) =>
                                        setField("platformName", event.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="supportEmail" className="text-[#2B1A12]">
                                    Support email
                                </Label>
                                <Input
                                    id="supportEmail"
                                    type="email"
                                    className="bg-white"
                                    value={draft.supportEmail}
                                    onChange={(event) =>
                                        setField("supportEmail", event.target.value)
                                    }
                                />
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">
                                Pricing & Commercials
                            </h2>
                            <p className="text-sm text-[#8B4513]">
                                Defaults applied to new subscriptions and affiliate payouts
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {NUMBER_FIELDS.map((field) => (
                                <div key={field.key} className="space-y-2">
                                    <Label htmlFor={field.key} className="text-[#2B1A12]">
                                        {field.label}
                                    </Label>
                                    <Input
                                        id={field.key}
                                        type="number"
                                        min={0}
                                        className="bg-white"
                                        value={draft[field.key]}
                                        onChange={(event) => {
                                            // Keep an empty box from becoming NaN.
                                            const next = event.target.value
                                            setField(
                                                field.key,
                                                next === "" ? 0 : Number(next),
                                            )
                                        }}
                                    />
                                    <p className="text-xs text-[#8B4513]">{field.hint}</p>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card className="p-6 border-[#e6dcc8] bg-white">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-[#2B1A12]">Features</h2>
                            <p className="text-sm text-[#8B4513]">
                                Switches that apply to every cafe on the platform
                            </p>
                        </div>
                        <div className="space-y-1">
                            {TOGGLE_FIELDS.map((field) => (
                                <div
                                    key={field.key}
                                    className="flex items-center justify-between gap-4 py-4 border-b border-[#f0e9dd] last:border-0"
                                >
                                    <div className="min-w-0">
                                        <Label
                                            htmlFor={field.key}
                                            className="text-[#2B1A12] font-semibold"
                                        >
                                            {field.label}
                                        </Label>
                                        <p className="text-xs text-[#8B4513] mt-0.5">
                                            {field.hint}
                                        </p>
                                    </div>
                                    <Switch
                                        id={field.key}
                                        className="data-[state=checked]:bg-[#BF5700] shrink-0"
                                        checked={draft[field.key]}
                                        onCheckedChange={(checked) =>
                                            setField(field.key, checked)
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card
                        className={`p-6 bg-white ${draft.maintenanceMode ? "border-red-300" : "border-[#e6dcc8]"}`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0">
                                <AlertTriangle
                                    className={`w-5 h-5 shrink-0 mt-0.5 ${draft.maintenanceMode ? "text-red-600" : "text-[#8B4513]"}`}
                                />
                                <div className="min-w-0">
                                    <Label
                                        htmlFor="maintenanceMode"
                                        className="text-[#2B1A12] font-semibold"
                                    >
                                        Maintenance mode
                                    </Label>
                                    <p className="text-xs text-[#8B4513] mt-0.5">
                                        Takes ordering offline for every cafe. Use only during a
                                        planned window.
                                    </p>
                                </div>
                            </div>
                            <Switch
                                id="maintenanceMode"
                                className="data-[state=checked]:bg-red-600 shrink-0"
                                checked={draft.maintenanceMode}
                                onCheckedChange={(checked) => setField("maintenanceMode", checked)}
                            />
                        </div>
                    </Card>

                    {saved && (
                        <p className="text-xs text-[#8B4513] text-center">
                            Last saved{" "}
                            {new Date(saved.updatedAt).toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                            })}
                        </p>
                    )}
                </div>
            ) : null}
        </div>
    )
}
