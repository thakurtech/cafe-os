"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchIcon, Download, MoreHorizontal, MessageCircle, Star, RefreshCw, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, useShop } from "@/lib/auth-context";
import { getOrders, type ShopOrder } from "@/lib/api";

type Segment = "VIP" | "Active" | "New" | "At Risk" | "Dormant";

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  orders: number;
  spent: number;
  lastVisit: string;
  lastVisitAt: number;
  /**
   * Loyalty points are intentionally null: nothing in the orders payload carries
   * them (see the note on deriving this list below).
   */
  points: number | null;
  segment: Segment;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function segmentFor(orderCount: number, spent: number, lastVisitAt: number): Segment {
  const daysSinceVisit = (Date.now() - lastVisitAt) / DAY_MS;
  if (daysSinceVisit > 60) return "Dormant";
  if (daysSinceVisit > 21) return "At Risk";
  if (spent >= 10000 || orderCount >= 20) return "VIP";
  if (orderCount <= 2) return "New";
  return "Active";
}

/**
 * Builds the CRM list from the shop's orders.
 *
 * This is a client-side derivation because the backend has no customers
 * endpoint: `GET /orders?shopId=` is the only shop-scoped source that carries
 * customer records (it includes the related `customer` user), and the loyalty
 * controller only exposes `/loyalty/stats` for the *signed-in* user plus a
 * global `/loyalty/leaderboard` — neither can list a shop's customers.
 *
 * A dedicated `GET /shops/:id/customers` endpoint would be better because:
 *  - it could join LoyaltyProfile, so the loyalty points column would hold real
 *    values instead of the "—" placeholder rendered below;
 *  - aggregation (order counts, lifetime spend, last visit) belongs in SQL —
 *    doing it here means downloading every order the shop has ever taken and
 *    re-summing it in the browser on every page view;
 *  - it could paginate, search and segment server-side, which this page cannot
 *    do correctly while it only sees whatever orders fit in one response;
 *  - walk-in orders have no customerId at all, so those diners are invisible
 *    here and the totals silently under-count them.
 */
function deriveCustomers(orders: ShopOrder[]): CustomerRow[] {
  const byCustomer = new Map<string, { customer: NonNullable<ShopOrder["customer"]>; orders: number; spent: number; lastVisitAt: number }>();

  for (const order of orders) {
    // Guest / walk-in orders carry no customer record — skip them.
    if (!order.customer) continue;
    // Cancelled and refunded orders should not inflate lifetime spend.
    if (order.status === "CANCELLED" || order.paymentStatus === "REFUNDED") continue;

    const createdAt = new Date(order.createdAt).getTime();
    const existing = byCustomer.get(order.customer.id);
    if (existing) {
      existing.orders += 1;
      existing.spent += order.totalAmount;
      existing.lastVisitAt = Math.max(existing.lastVisitAt, createdAt);
    } else {
      byCustomer.set(order.customer.id, {
        customer: order.customer,
        orders: 1,
        spent: order.totalAmount,
        lastVisitAt: createdAt,
      });
    }
  }

  return Array.from(byCustomer.values())
    .map(({ customer, orders: orderCount, spent, lastVisitAt }) => ({
      id: customer.id,
      name: customer.name || "Guest",
      phone: customer.phone || "—",
      orders: orderCount,
      spent: Math.round(spent),
      lastVisit: Number.isFinite(lastVisitAt)
        ? formatDistanceToNow(new Date(lastVisitAt), { addSuffix: true })
        : "—",
      lastVisitAt,
      points: null,
      segment: segmentFor(orderCount, spent, lastVisitAt),
    }))
    .sort((a, b) => b.spent - a.spent);
}

export default function CustomersPage() {
  // shopId follows the pattern used by the other dashboard pages: the shop from
  // auth context (hydrated from the `shop_data` localStorage key), falling back
  // to the shopId carried on the logged-in user.
  const { user, loading: authLoading } = useAuth();
  const shop = useShop();
  const shopId = shop?.id ?? user?.shopId;

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadCustomers = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    try {
      const data: ShopOrder[] = await getOrders(shopId);
      setCustomers(deriveCustomers(Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    if (authLoading) return;
    if (!shopId) {
      setLoading(false);
      setError("No shop is linked to this account. Sign in again to continue.");
      return;
    }
    loadCustomers();
  }, [authLoading, shopId, loadCustomers]);

  const visibleCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) =>
      `${customer.name} ${customer.phone}`.toLowerCase().includes(needle),
    );
  }, [customers, query]);

  const getSegmentColor = (segment: string) => {
    switch(segment) {
      case 'VIP': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Active': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'New': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'At Risk': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Dormant': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8 pt-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Customers CRM</h2>
          <p className="text-slate-500">Track loyalty, order history, and engage with your diners.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadCustomers} disabled={loading || !shopId}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            className="pl-9 bg-white"
            placeholder="Search by name or phone number..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="bg-white">Segment: All</Button>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Total Spent</TableHead>
              <TableHead>Last Visit</TableHead>
              <TableHead>Loyalty Points</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="inline-block animate-spin w-6 h-6 border-4 border-emerald-500 border-t-transparent rounded-full" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-600">
                    <AlertTriangle className="h-6 w-6 text-orange-500" />
                    <p className="text-sm">{error}</p>
                    {shopId && (
                      <Button variant="outline" size="sm" onClick={loadCustomers}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Try again
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : visibleCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  {customers.length === 0
                    ? "No customers yet. Diners appear here once they place an order with an account."
                    : "No customers match your search."}
                </TableCell>
              </TableRow>
            ) : visibleCustomers.map((customer) => (
              <TableRow key={customer.id} className="hover:bg-slate-50 cursor-pointer">
                <TableCell>
                  <div className="font-medium text-slate-900">{customer.name}</div>
                  <div className="text-sm text-slate-500">{customer.phone}</div>
                </TableCell>
                <TableCell>{customer.orders}</TableCell>
                <TableCell className="font-medium">₹{customer.spent.toLocaleString()}</TableCell>
                <TableCell className="text-sm text-slate-600">{customer.lastVisit}</TableCell>
                <TableCell>
                  <div className="flex items-center">
                    <Star className="w-3 h-3 text-yellow-500 mr-1 fill-yellow-500" />
                    <span
                      className="font-medium"
                      title={
                        customer.points === null
                          ? "Loyalty points need a shop customers endpoint that joins the loyalty profile"
                          : undefined
                      }
                    >
                      {customer.points ?? "—"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`border ${getSegmentColor(customer.segment)}`}>
                    {customer.segment}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" title="Send message">
                    <MessageCircle className="h-4 w-4 text-blue-500" />
                  </Button>
                  <Button variant="ghost" size="icon" title="View details">
                    <MoreHorizontal className="h-4 w-4 text-slate-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          {visibleCustomers.length === 0
            ? "Showing 0 entries"
            : `Showing 1 to ${visibleCustomers.length} of ${visibleCustomers.length} entries`}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>Previous</Button>
          <Button variant="outline" size="sm" disabled>Next</Button>
        </div>
      </div>
    </div>
  );
}
