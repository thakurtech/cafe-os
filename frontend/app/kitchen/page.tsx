"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, CheckCircle2, PlayCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth, useShop } from "@/lib/auth-context";
import { getKitchenOrders, updateOrderStatus, type ShopOrder, type ShopOrderSource } from "@/lib/api";

type BoardStatus = "NEW" | "PREPARING" | "READY";

interface KitchenItem {
  name: string;
  qty: number;
}

interface KitchenOrder {
  /** Real database id — used for status updates. */
  id: string;
  /** Human-facing short id (e.g. "1048"). */
  label: string;
  time: number;
  items: KitchenItem[];
  type: string;
  table: string | null;
  status: BoardStatus;
}

const REFRESH_INTERVAL_MS = 15000;

const SOURCE_LABELS: Record<ShopOrderSource, string> = {
  POS: "Counter",
  QR_TABLE: "Dine-in",
  QR_PICKUP: "Takeaway",
  DELIVERY: "Delivery",
  MINI_APP: "Online",
  STOREFRONT: "Online",
};

function toBoardStatus(status: ShopOrder["status"]): BoardStatus {
  if (status === "PREPARING") return "PREPARING";
  if (status === "READY") return "READY";
  return "NEW"; // PENDING / CONFIRMED — the kitchen endpoint returns nothing else.
}

function toKitchenOrder(order: ShopOrder): KitchenOrder {
  return {
    id: order.id,
    label: (order.shortId || order.id).replace(/^#/, ""),
    time: new Date(order.createdAt).getTime(),
    items: (order.items ?? []).map((item) => ({
      name: item.nameSnapshot || item.menuItem?.name || "Item",
      qty: item.quantity,
    })),
    type: order.tableNumber ? "Dine-in" : SOURCE_LABELS[order.source] ?? "Order",
    table: order.tableNumber,
    status: toBoardStatus(order.status),
  };
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as typeof window & { webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

export default function KitchenDisplaySystem() {
  // shopId follows the same pattern as the dashboard pages: the shop from auth
  // context (hydrated from the `shop_data` localStorage key), falling back to
  // the shopId carried on the logged-in user.
  const { user, loading: authLoading } = useAuth();
  const shop = useShop();
  const shopId = shop?.id ?? user?.shopId;

  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const knownIdsRef = useRef<Set<string> | null>(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const playBeep = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      if (!audioCtxRef.current) {
        const Ctor = getAudioContextCtor();
        if (!Ctor) return;
        audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.log("Audio play blocked", e);
    }
  }, []);

  const loadOrders = useCallback(
    async (options: { showSpinner?: boolean } = {}) => {
      if (!shopId) return;
      if (options.showSpinner) setLoading(true);
      try {
        const data: ShopOrder[] = await getKitchenOrders(shopId);
        const mapped = (Array.isArray(data) ? data : []).map(toKitchenOrder);

        // Beep once per genuinely new ticket (skipped on the very first load).
        const seen = knownIdsRef.current;
        if (seen && mapped.some((order) => !seen.has(order.id))) {
          playBeep();
        }
        knownIdsRef.current = new Set(mapped.map((order) => order.id));

        setOrders(mapped);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load kitchen orders");
      } finally {
        setLoading(false);
        setHasLoaded(true);
      }
    },
    [shopId, playBeep],
  );

  // Initial load + polling so the board keeps reflecting the server.
  useEffect(() => {
    if (authLoading) return;
    if (!shopId) {
      setLoading(false);
      setHasLoaded(true);
      setError("No shop is linked to this account. Sign in again to continue.");
      return;
    }

    loadOrders({ showSpinner: true });
    const interval = setInterval(() => loadOrders(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [authLoading, shopId, loadOrders]);

  const updateStatus = async (id: string, newStatus: "PREPARING" | "READY" | "COMPLETED") => {
    setUpdatingId(id);
    try {
      await updateOrderStatus(id, newStatus);
      toast.success(
        newStatus === "PREPARING"
          ? "Order moved to preparing"
          : newStatus === "READY"
            ? "Order marked ready"
            : "Order completed",
      );
      // Refetch so the board shows the server's state, not a local guess.
      await loadOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the order");
    } finally {
      setUpdatingId(null);
    }
  };

  const getElapsedTime = (timestamp: number) => {
    const diff = Math.max(0, Math.floor((currentTime.getTime() - timestamp) / 1000));
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return { mins, secs, isLate: mins >= 10, isWarning: mins >= 5 };
  };

  const newOrders = orders.filter(o => o.status === 'NEW');
  const prepOrders = orders.filter(o => o.status === 'PREPARING');
  const readyOrders = orders.filter(o => o.status === 'READY');

  const OrderCard = ({ order }: { order: KitchenOrder }) => {
    const time = getElapsedTime(order.time);
    const isUpdating = updatingId === order.id;

    return (
      <div className={`rounded-xl border-2 p-4 shadow-lg transition-all ${
        time.isLate ? 'bg-red-950 border-red-500' :
        time.isWarning ? 'bg-amber-950 border-amber-500' :
        'bg-[#1a1a2e] border-slate-700'
      }`}>
        <div className="flex justify-between items-start mb-3 pb-3 border-b border-white/10">
          <div>
            <h3 className="text-2xl font-black text-white">#{order.label}</h3>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline" className="text-slate-300 border-slate-600 bg-slate-800">
                {order.type}
              </Badge>
              {order.table && (
                <Badge variant="outline" className="text-amber-400 border-amber-700 bg-amber-900/30">
                  {order.table}
                </Badge>
              )}
            </div>
          </div>
          <div className={`text-xl font-bold font-mono px-3 py-1 rounded-lg ${
            time.isLate ? 'bg-red-600 text-white animate-pulse' :
            time.isWarning ? 'bg-amber-600 text-white' :
            'bg-slate-800 text-emerald-400'
          }`}>
            {time.mins}:{time.secs.toString().padStart(2, '0')}
          </div>
        </div>

        <ul className="space-y-3 mb-6 min-h-[120px]">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-start text-lg text-slate-200">
              <span className="font-black bg-slate-800 text-white w-8 h-8 flex items-center justify-center rounded mr-3 shrink-0">
                {item.qty}x
              </span>
              <span className="font-medium leading-tight pt-1">{item.name}</span>
            </li>
          ))}
        </ul>

        {order.status === 'NEW' && (
          <Button
            className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isUpdating}
            onClick={() => updateStatus(order.id, 'PREPARING')}
          >
            <PlayCircle className="mr-2 h-6 w-6" /> {isUpdating ? 'Saving...' : 'Start Preparing'}
          </Button>
        )}

        {order.status === 'PREPARING' && (
          <Button
            className="w-full h-14 text-lg font-bold bg-amber-600 hover:bg-amber-700 text-white"
            disabled={isUpdating}
            onClick={() => updateStatus(order.id, 'READY')}
          >
            <CheckCircle2 className="mr-2 h-6 w-6" /> {isUpdating ? 'Saving...' : 'Mark Ready'}
          </Button>
        )}

        {order.status === 'READY' && (
          <Button
            className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={isUpdating}
            onClick={() => updateStatus(order.id, 'COMPLETED')}
          >
            <CheckCircle2 className="mr-2 h-6 w-6" /> {isUpdating ? 'Saving...' : 'Complete & Clear'}
          </Button>
        )}
      </div>
    );
  };

  const showInitialSpinner = loading && !hasLoaded;
  const showBlockingError = !!error && hasLoaded && orders.length === 0;

  return (
    <div className="flex flex-col h-screen bg-[#0f0f1a] text-white overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-[#1a1a2e] border-b border-slate-800 flex items-center justify-between px-6 shrink-0 shadow-md">
        <div className="flex items-center">
          <h1 className="text-2xl font-black text-emerald-400 tracking-tight">KITCHEN DISPLAY</h1>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-xl font-bold font-mono tracking-wider text-slate-300">
            {currentTime.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-slate-600 bg-slate-800 text-slate-300"
            onClick={() => loadOrders({ showSpinner: true })}
            disabled={loading || !shopId}
          >
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`border-slate-600 ${soundEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              if (!soundEnabled) {
                // Initialize audio context on user gesture
                try {
                  const Ctor = getAudioContextCtor();
                  if (Ctor) audioCtxRef.current = new Ctor();
                } catch (e) {
                  console.log("Audio init blocked", e);
                }
              }
            }}
          >
            {soundEnabled ? <Volume2 className="h-5 w-5 mr-2" /> : <VolumeX className="h-5 w-5 mr-2" />}
            Sound {soundEnabled ? 'ON' : 'OFF'}
          </Button>
        </div>
      </header>

      {/* Stale-data warning: the board still shows the last good snapshot. */}
      {error && !showBlockingError && (
        <div className="shrink-0 bg-red-950/60 border-b border-red-800 px-6 py-2 flex items-center gap-3 text-sm text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error} — showing the last board we loaded.</span>
          <Button
            variant="outline"
            size="sm"
            className="border-red-700 bg-red-900/40 text-red-100"
            onClick={() => loadOrders({ showSpinner: true })}
          >
            Retry
          </Button>
        </div>
      )}

      {showInitialSpinner ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400">
          <div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full" />
          <p className="text-lg font-medium">Loading the board...</p>
        </div>
      ) : showBlockingError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500" />
          <p className="text-xl font-bold text-white">Could not load the kitchen board</p>
          <p className="text-slate-400 max-w-md">{error}</p>
          {shopId && (
            <Button
              className="h-12 px-6 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => loadOrders({ showSpinner: true })}
            >
              <RefreshCw className="mr-2 h-5 w-5" /> Try again
            </Button>
          )}
        </div>
      ) : (
        /* Main KDS Columns */
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 p-6 overflow-hidden">

          {/* NEW ORDERS */}
          <div className="flex flex-col overflow-hidden bg-slate-900/50 rounded-2xl border border-slate-800">
            <div className="p-4 bg-blue-900/30 border-b border-blue-900/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-blue-400">NEW ORDERS</h2>
              <Badge className="bg-blue-600 text-white text-lg px-3">{newOrders.length}</Badge>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {newOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600">
                  <CheckCircle2 className="w-12 h-12 mb-2 opacity-20" />
                  <p>No new orders</p>
                </div>
              ) : (
                newOrders.map(order => <OrderCard key={order.id} order={order} />)
              )}
            </div>
          </div>

          {/* PREPARING */}
          <div className="flex flex-col overflow-hidden bg-slate-900/50 rounded-2xl border border-slate-800">
            <div className="p-4 bg-amber-900/30 border-b border-amber-900/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-amber-400">PREPARING</h2>
              <Badge className="bg-amber-600 text-white text-lg px-3">{prepOrders.length}</Badge>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {prepOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600">
                  <p>Kitchen is clear</p>
                </div>
              ) : (
                prepOrders.map(order => <OrderCard key={order.id} order={order} />)
              )}
            </div>
          </div>

          {/* READY */}
          <div className="flex flex-col overflow-hidden bg-slate-900/50 rounded-2xl border border-slate-800">
            <div className="p-4 bg-emerald-900/30 border-b border-emerald-900/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-emerald-400">READY</h2>
              <Badge className="bg-emerald-600 text-white text-lg px-3">{readyOrders.length}</Badge>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {readyOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600">
                  <p>No ready orders</p>
                </div>
              ) : (
                readyOrders.map(order => <OrderCard key={order.id} order={order} />)
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
