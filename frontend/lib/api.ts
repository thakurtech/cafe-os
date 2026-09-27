import { MenuCategory, CartItem } from './types';

// API URL from environment variable with fallback
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper to get auth token
function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
}

// Helper for authenticated requests
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getAuthToken();
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        // Token expired or invalid
        if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            window.location.href = '/login';
        }
    }

    return response;
}

// ==================== MENU ====================

const DEMO_MENU: MenuCategory[] = [
    {
        id: 'cat-1',
        name: 'Coffee',
        items: [
            { id: 'm-1', name: 'Espresso', price: 150, description: 'Rich double shot espresso', isAvailable: true },
            { id: 'm-2', name: 'Cappuccino', price: 200, description: 'Espresso with velvety foamed milk', isAvailable: true },
            { id: 'm-3', name: 'Café Latte', price: 220, description: 'Smooth espresso with steamed milk', isAvailable: true },
            { id: 'm-4', name: 'Americano', price: 180, description: 'Diluted espresso with hot water', isAvailable: true },
            { id: 'm-5', name: 'Mocha', price: 250, description: 'Chocolate espresso drink', isAvailable: true },
        ]
    },
    {
        id: 'cat-2',
        name: 'Food & Bakery',
        items: [
            { id: 'm-6', name: 'Butter Croissant', price: 120, description: 'Flaky French pastry', isAvailable: true },
            { id: 'm-7', name: 'Grilled Veggie Sandwich', price: 180, description: 'Fresh toasted sandwich', isAvailable: true },
            { id: 'm-8', name: 'Blueberry Muffin', price: 100, description: 'Freshly baked muffin', isAvailable: true },
            { id: 'm-9', name: 'Fudge Brownie', price: 150, description: 'Rich chocolate fudge brownie', isAvailable: true },
        ]
    }
];

export async function fetchMenu(shopSlug?: string): Promise<MenuCategory[]> {
    let slug = shopSlug;
    if (!slug && typeof window !== 'undefined') {
        const shopData = localStorage.getItem('shop_data');
        if (shopData) {
            try {
                const shop = JSON.parse(shopData);
                slug = shop.slug;
            } catch (e) {}
        }
    }

    if (!slug) {
        slug = 'cafe-noir';
    }

    try {
        const res = await fetchWithAuth(`${API_URL}/menu?shop=${slug}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) return data;
        }
    } catch (e) {
        console.warn('API fetchMenu failed, using demo fallback:', e);
    }

    return DEMO_MENU;
}

// ==================== ORDERS ====================

export interface CreateOrderPayload {
    shopId: string;
    items: { menuItemId: string; quantity: number; modifiers?: string[] }[];
    source: 'POS' | 'QR_TABLE' | 'QR_PICKUP';
    customerId?: string;
    tableNumber?: string;
    paymentMethod?: 'UPI' | 'CASH';
    discountCode?: string;
    notes?: string;
}

export async function createOrder(payload: CreateOrderPayload) {
    const res = await fetchWithAuth(`${API_URL}/orders`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Failed to create order' }));
        throw new Error(error.message || 'Failed to create order');
    }
    return res.json();
}

export async function getOrders(shopId: string) {
    const res = await fetchWithAuth(`${API_URL}/orders?shopId=${shopId}`);
    if (!res.ok) throw new Error('Failed to fetch orders');
    return res.json();
}

export async function getKitchenOrders(shopId: string) {
    const res = await fetchWithAuth(`${API_URL}/orders/kitchen?shopId=${shopId}`);
    if (!res.ok) throw new Error('Failed to fetch kitchen orders');
    return res.json();
}

export async function updateOrderStatus(orderId: string, status: string) {
    const res = await fetchWithAuth(`${API_URL}/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update order status');
    return res.json();
}

// ==================== AUTH ====================

export async function login(email: string, password: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Login failed' }));
        throw new Error(error.message || 'Login failed');
    }
    return res.json();
}

export async function register(data: { email: string; password: string; name: string; role?: string }) {
    const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Registration failed' }));
        throw new Error(error.message || 'Registration failed');
    }
    return res.json();
}

// ==================== SHOPS ====================

export async function getShopBySlug(slug: string) {
    const res = await fetchWithAuth(`${API_URL}/shops/${slug}`);
    if (!res.ok) throw new Error('Shop not found');
    return res.json();
}

export async function getShops() {
    const res = await fetchWithAuth(`${API_URL}/shops`);
    if (!res.ok) throw new Error('Failed to fetch shops');
    return res.json();
}

// ==================== REPORTS ====================

export async function getSalesReport(shopId: string, from: string, to: string) {
    const res = await fetchWithAuth(`${API_URL}/reports/sales?shopId=${shopId}&from=${from}&to=${to}`);
    if (!res.ok) throw new Error('Failed to fetch sales report');
    return res.json();
}

export async function getTopItems(shopId: string, limit: number = 10) {
    const res = await fetchWithAuth(`${API_URL}/reports/top-items?shopId=${shopId}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch top items');
    return res.json();
}

// ==================== SUPER ADMIN ====================

export interface PlatformAnalytics {
    range: { days: number; from: string; to: string };
    totals: {
        orders: number;
        revenue: number;
        avgOrderValue: number;
        customers: number;
        totalCafes: number;
        activeCafes: number;
    };
    growth: {
        orders: number;
        revenue: number;
        avgOrderValue: number;
        customers: number;
        cafes: number;
    };
    timeseries: { date: string; orders: number; revenue: number }[];
    topCafes: { id: string; name: string; slug: string; orders: number; revenue: number }[];
    sourceMix: { key: string; orders: number; revenue: number }[];
    paymentMix: { key: string; orders: number; revenue: number }[];
    hourly: { hour: number; orders: number; revenue: number }[];
}

export async function getPlatformAnalytics(days: number = 30): Promise<PlatformAnalytics> {
    const res = await fetchWithAuth(`${API_URL}/super-admin/analytics?days=${days}`);
    if (!res.ok) throw new Error('Failed to fetch platform analytics');
    return res.json();
}

export interface PlatformStats {
    mrr: number;
    mrrGrowth: number;
    totalCafes: number;
    cafeGrowth: number;
    activeUsers: number;
    userGrowth: number;
    ordersToday: number;
    orderGrowth: number;
}

export async function getPlatformStats(): Promise<PlatformStats> {
    const res = await fetchWithAuth(`${API_URL}/super-admin/platform-stats`);
    if (!res.ok) throw new Error('Failed to fetch platform stats');
    return res.json();
}

export interface BillingRow {
    shopId: string;
    shopName: string;
    slug: string;
    plan: string;
    status: string;
    priceMonthly: number;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    isBilled: boolean;
    hasPaymentLink: boolean;
}

export interface RevenueOverview {
    mrr: number;
    arr: number;
    arpa: number;
    growth: { mrr: number };
    counts: {
        total: number;
        active: number;
        trialing: number;
        pastDue: number;
        grace: number;
        suspended: number;
        cancelled: number;
        withoutSubscription: number;
    };
    atRisk: { subscriptions: number; mrr: number };
    planMix: { plan: string; subscriptions: number; mrr: number; share: number }[];
    statusMix: { status: string; subscriptions: number; mrr: number }[];
    mrrTrend: { month: string; mrr: number }[];
    trialsEndingSoon: BillingRow[];
    renewalsDue: BillingRow[];
    billing: BillingRow[];
}

export async function getRevenueOverview(): Promise<RevenueOverview> {
    const res = await fetchWithAuth(`${API_URL}/super-admin/revenue`);
    if (!res.ok) throw new Error('Failed to fetch revenue overview');
    return res.json();
}

export interface AffiliateSummary {
    id: string;
    userId: string;
    name: string;
    email: string | null;
    phone: string;
    code: string;
    commissionRate: number;
    balance: number;
    referrals: { total: number; converted: number; trial: number };
    paidToDate: number;
    pendingPayout: number;
}

export interface PayoutRow {
    id: string;
    affiliateId: string;
    affiliateName: string;
    affiliateCode: string;
    amount: number;
    status: string;
    createdAt: string;
}

export interface AffiliateOverview {
    totals: {
        affiliates: number;
        producingAffiliates: number;
        referrals: number;
        convertedReferrals: number;
        trialReferrals: number;
        outstandingBalance: number;
        pendingPayoutAmount: number;
        paidOutAmount: number;
    };
    affiliates: AffiliateSummary[];
    pendingPayouts: PayoutRow[];
    recentPayouts: PayoutRow[];
}

export async function getAffiliateOverview(): Promise<AffiliateOverview> {
    const res = await fetchWithAuth(`${API_URL}/super-admin/affiliates`);
    if (!res.ok) throw new Error('Failed to fetch affiliate overview');
    return res.json();
}

async function actOnPayout(payoutId: string, action: 'approve' | 'reject') {
    const res = await fetchWithAuth(
        `${API_URL}/super-admin/affiliates/payouts/${payoutId}/${action}`,
        { method: 'POST' },
    );
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: `Failed to ${action} payout` }));
        throw new Error(error.message || `Failed to ${action} payout`);
    }
    return res.json();
}

export function approvePayout(payoutId: string) {
    return actOnPayout(payoutId, 'approve');
}

export function rejectPayout(payoutId: string) {
    return actOnPayout(payoutId, 'reject');
}

// Export API URL for WebSocket connections
export { API_URL };
