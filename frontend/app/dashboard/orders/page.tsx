"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchIcon, Filter, ExternalLink, RefreshCw, Eye, AlertTriangle } from "lucide-react";
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
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth, useShop } from "@/lib/auth-context";
import {
  getOrders,
  type ShopOrder,
  type ShopOrderPaymentMethod,
  type ShopOrderSource,
} from "@/lib/api";

type DisplayStatus = "Completed" | "Cancelled" | "Refunded" | "In Progress";
type DisplaySource = "POS" | "QR" | "Online" | "Delivery";

interface OrderRow {
  /** Real database id, used for React keys and any future API calls. */
  id: string;
  /** Human-facing short id (e.g. "1042"). */
  label: string;
  time: string;
  items: string;
  customer: string;
  amount: number;
  payment: string;
  type: DisplaySource;
  status: DisplayStatus;
}

const PAYMENT_LABELS: Record<ShopOrderPaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  SPLIT: "Split",
  RAZORPAY: "Razorpay",
  PAY_AT_COUNTER: "Pay at counter",
};

const SOURCE_LABELS: Record<ShopOrderSource, DisplaySource> = {
  POS: "POS",
  QR_TABLE: "QR",
  QR_PICKUP: "QR",
  DELIVERY: "Delivery",
  MINI_APP: "Online",
  STOREFRONT: "Online",
};

function toDisplayStatus(order: ShopOrder): DisplayStatus {
  // A refunded order also carries status CANCELLED on the backend, so the
  // paymentStatus check has to come first.
  if (order.paymentStatus === "REFUNDED") return "Refunded";
  if (order.status === "CANCELLED") return "Cancelled";
  if (order.status === "COMPLETED") return "Completed";
  return "In Progress";
}

function describeItems(order: ShopOrder): string {
  if (!order.items?.length) return "—";
  return order.items
    .map((item) => {
      const name = item.nameSnapshot || item.menuItem?.name || "Item";
      return item.quantity > 1 ? `${name} x${item.quantity}` : name;
    })
    .join(", ");
}

function toRow(order: ShopOrder): OrderRow {
  return {
    id: order.id,
    label: (order.shortId || order.id).replace(/^#/, ""),
    time: new Date(order.createdAt).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    items: describeItems(order),
    customer: order.customer?.name || order.customer?.phone || "Guest",
    amount: Math.round(order.totalAmount),
    payment: PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod,
    type: SOURCE_LABELS[order.source] ?? "POS",
    status: toDisplayStatus(order),
  };
}

export default function OrdersHistoryPage() {
  // shopId follows the pattern used by the other dashboard pages: the shop from
  // auth context (hydrated from the `shop_data` localStorage key), falling back
  // to the shopId carried on the logged-in user.
  const { user, loading: authLoading } = useAuth();
  const shop = useShop();
  const shopId = shop?.id ?? user?.shopId;

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Refund state
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const loadOrders = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    try {
      const data: ShopOrder[] = await getOrders(shopId);
      setOrders((Array.isArray(data) ? data : []).map(toRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
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
    loadOrders();
  }, [authLoading, shopId, loadOrders]);

  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) =>
      [order.label, order.customer, order.items, order.status]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [orders, query]);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Completed': return 'bg-emerald-100 text-emerald-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      case 'Refunded': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'POS': return 'bg-blue-100 text-blue-800';
      case 'QR': return 'bg-purple-100 text-purple-800';
      case 'Online': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // NOTE: this only marks the row refunded in the local table — it is not sent
  // to the server, so a refresh will show the order's real status again. The
  // backend exposes POST /orders/:id/refund; wiring money movement to it was
  // deliberately left out of this change.
  const handleRefund = () => {
    if (!refundTarget) return;
    if (!refundReason.trim()) {
      toast.error("Please provide a reason for the refund");
      return;
    }

    setOrders(orders.map(o => o.id === refundTarget.id ? { ...o, status: 'Refunded' } : o));
    setIsRefundOpen(false);
    setRefundReason("");
    setRefundTarget(null);
    toast.warning("Marked as refunded in this view only — not yet sent to the server");
  };

  const openRefundDialog = (order: OrderRow) => {
    setRefundTarget(order);
    setRefundReason("");
    setIsRefundOpen(true);
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8 pt-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Orders History</h2>
          <p className="text-slate-500">View and manage all past transactions.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadOrders} disabled={loading || !shopId}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline">
            <ExternalLink className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            className="pl-9 bg-white"
            placeholder="Search order ID, customer..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="bg-white"><Filter className="mr-2 h-4 w-4" /> Filters</Button>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="inline-block animate-spin w-6 h-6 border-4 border-emerald-500 border-t-transparent rounded-full" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-600">
                    <AlertTriangle className="h-6 w-6 text-orange-500" />
                    <p className="text-sm">{error}</p>
                    {shopId && (
                      <Button variant="outline" size="sm" onClick={loadOrders}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Try again
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : visibleOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-slate-500">
                  {orders.length === 0
                    ? "No orders yet. They will show up here as soon as your first order comes in."
                    : "No orders match your search."}
                </TableCell>
              </TableRow>
            ) : visibleOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">#{order.label}</TableCell>
                <TableCell className="text-slate-500 text-sm">{order.time}</TableCell>
                <TableCell>{order.customer}</TableCell>
                <TableCell className="max-w-[200px] truncate" title={order.items}>{order.items}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`border-none ${getTypeColor(order.type)}`}>
                    {order.type}
                  </Badge>
                </TableCell>
                <TableCell>{order.payment}</TableCell>
                <TableCell className="font-semibold">₹{order.amount}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`border-none ${getStatusColor(order.status)}`}>
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" title="View details">
                    <Eye className="h-4 w-4 text-slate-600" />
                  </Button>
                  {order.status === 'Completed' && (
                    <Button variant="ghost" size="icon" title="Refund" onClick={() => openRefundDialog(order)}>
                      <RefreshCw className="h-4 w-4 text-orange-500" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isRefundOpen} onOpenChange={setIsRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Order #{refundTarget?.label}</DialogTitle>
            <DialogDescription>
              Process a full refund for this order. The customer paid ₹{refundTarget?.amount} via {refundTarget?.payment}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for Refund <span className="text-red-500">*</span></label>
              <Input
                placeholder="e.g. Item missing, Customer unhappy, Accidental charge..."
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRefundOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRefund}>Process Full Refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
