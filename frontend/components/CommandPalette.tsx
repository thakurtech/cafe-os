"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import {
    Search,
    Home,
    ShoppingBag,
    Users,
    Settings,
    LayoutDashboard,
    Coffee,
    Gift,
    Calendar,
    Bell,
    TrendingUp,
    FileText,
    Package,
    UserCircle,
} from "lucide-react"
import { useHotkeys } from "react-hotkeys-hook"

interface CommandPaletteProps {
    open: boolean
    setOpen: (open: boolean) => void
}

const actions = [
    { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard", keywords: ["home", "overview"] },
    { title: "Orders", icon: ShoppingBag, href: "/dashboard/orders", keywords: ["pos", "sales"] },
    { title: "Menu Management", icon: Coffee, href: "/dashboard/menu", keywords: ["items", "food"] },
    { title: "Customers", icon: Users, href: "/dashboard/customers", keywords: ["guests", "people"] },
    { title: "Analytics", icon: TrendingUp, href: "/dashboard/analytics", keywords: ["reports", "stats"] },
    { title: "Campaigns", icon: Bell, href: "/dashboard/campaigns", keywords: ["marketing", "promotions"] },
    { title: "Loyalty & Rewards", icon: Gift, href: "/dashboard/loyalty", keywords: ["points", "vouchers"] },
    { title: "Tables & QR", icon: Calendar, href: "/dashboard/tables", keywords: ["bookings", "reservations", "qr"] },
    { title: "Inventory", icon: Package, href: "/dashboard/inventory", keywords: ["stock", "supplies"] },
    { title: "Staff & Shifts", icon: UserCircle, href: "/dashboard/staff", keywords: ["team", "roster"] },
    { title: "Settings", icon: Settings, href: "/dashboard/settings", keywords: ["preferences", "config"] },
    { title: "Landing Page", icon: Home, href: "/", keywords: ["home", "public"] },
]

export function CommandPalette({ open, setOpen }: CommandPaletteProps) {
    const router = useRouter()

    useHotkeys("mod+k", (e) => {
        e.preventDefault()
        setOpen(!open)
    })

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpen(false)
            }
        }
        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [setOpen])

    const runCommand = React.useCallback((command: () => void) => {
        setOpen(false)
        command()
    }, [setOpen])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] px-4">
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setOpen(false)}
            />
            <Command className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="flex items-center px-4 border-b border-gray-200">
                    <Search className="w-5 h-5 text-gray-400 mr-3" />
                    <Command.Input
                        placeholder="Search for actions, pages, or settings..."
                        className="w-full h-14 bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
                    />
                </div>

                <Command.List className="max-h-[400px] overflow-y-auto p-2">
                    <Command.Empty className="py-12 text-center text-sm text-gray-500">
                        No results found.
                    </Command.Empty>

                    <Command.Group heading="Navigation" className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {actions.map((action) => (
                            <Command.Item
                                key={action.href}
                                value={`${action.title} ${action.keywords.join(" ")}`}
                                onSelect={() => runCommand(() => router.push(action.href))}
                                className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors group"
                            >
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                                    <action.icon className="w-5 h-5 text-gray-600 group-hover:text-orange-600 transition-colors" />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium text-gray-900 text-sm">{action.title}</div>
                                    <div className="text-xs text-gray-500">{action.href}</div>
                                </div>
                                <kbd className="hidden sm:inline-flex h-6 px-2 items-center gap-1 rounded bg-gray-100 text-[10px] font-medium text-gray-500">
                                    Enter
                                </kbd>
                            </Command.Item>
                        ))}
                    </Command.Group>
                </Command.List>

                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 rounded bg-white border border-gray-200">↑↓</kbd>
                            <span>Navigate</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 rounded bg-white border border-gray-200">Enter</kbd>
                            <span>Select</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 rounded bg-white border border-gray-200">Esc</kbd>
                        <span>Close</span>
                    </div>
                </div>
            </Command>
        </div>
    )
}
