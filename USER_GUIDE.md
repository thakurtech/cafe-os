# ☕ CaféOS User Guide

**Status:** ✅ System Fully Operational
**Version:** 1.0.0

---

## 🚀 Quick Access URLs

| Portal | URL | Description |
|--------|-----|-------------|
| **Login Page** | [http://localhost:3000/login](http://localhost:3000/login) | Main entry point for all users |
| **Super Admin** | [http://localhost:3000/super-admin](http://localhost:3000/super-admin) | Manage all cafes, owners, and platform settings |
| **Cafe Dashboard** | [http://localhost:3000/dashboard](http://localhost:3000/dashboard) | Owner's view: analytics, menu, staff |
| **POS System** | [http://localhost:3000/pos](http://localhost:3000/pos) | Cashier interface for taking orders |
| **Kitchen Display** | [http://localhost:3000/kitchen](http://localhost:3000/kitchen) | Chef's view for incoming orders |

---

## 🔑 Login Credentials

### 1. Super Admin (You)
*   **Email:** `admin@cafeos.com`
*   **Password:** `password`
*   **Role:** Platform Owner
*   **Capabilities:** Create cafes, manage subscriptions, view global analytics.

### 2. Cafe Owner (Demo Account)
*   **Email:** `owner@cafenoir.com`
*   **Password:** `password`
*   **Role:** Shop Owner
*   **Capabilities:** Manage menu, view shop reports, manage staff.

---

## 🛠️ Typical Workflows

### 🆕 Create a New Cafe
1.  Login as **Super Admin**.
2.  Navigate to **Cafes** > **New Cafe**.
3.  Fill in Cafe Details (Name, Slug, Address).
4.  Create Owner Account (Name, Email, **Password**).
    *   *Note: Password is now required and hashed automatically.*
5.  Set Branding (Theme Color, UPI ID).
6.  Click **Create Cafe**.

### ☕ Process an Order (POS)
1.  Login as **Cafe Owner** (or use a Cashier account).
2.  Go to **POS** (`/pos`).
3.  Tap menu items to add to cart.
4.  Select **Dine In** or **Takeaway**.
5.  Click **Charge** > Select Payment Method (Cash/UPI).
6.  Order is sent to Kitchen!

### 👨‍🍳 Complete an Order (Kitchen)
1.  Go to **Kitchen Display** (`/kitchen`).
2.  You will see the new order card.
3.  Click **"Mark Ready"** when food is prepared.
4.  Order moves to *Completed* tab.

---

## ⚠️ Important Deployment Notes

1.  **Mobile Hotspot:** Currently, the database (Supabase) connection requires a mobile hotspot due to ISP port blocking on local WiFi. Ensure your laptop is connected to your phone's hotspot.
2.  **Server Status:** Ensure both terminals are running:
    *   Backend: `npm run start:dev` (Port 3001)
    *   Frontend: `npm run dev` (Port 3000)

---

## 🎉 Ready for Sales?
**Yes!** The application core flows are complete. You can now demo this to potential cafe owners.

---

## 🛡️ Super Admin Console

Every page under `/super-admin` reads live data from the platform database.

| Page | What it shows |
|------|---------------|
| **Overview** (`/super-admin`) | MRR, cafe count, users, orders today — each with real growth vs. the previous 30 days |
| **Analytics** (`/super-admin/analytics`) | Revenue and order trends over 7/30/90 days, peak hours, order channels, payment mix, top-performing cafes |
| **Revenue** (`/super-admin/revenue`) | MRR/ARR/ARPA, revenue by plan, subscription health, trials ending this week, renewals due, per-cafe billing |
| **Affiliates** (`/super-admin/affiliates`) | Partner performance, payout requests to approve or decline, settlement history |
| **Settings** (`/super-admin/settings`) | Plan pricing, affiliate commission, trial and grace length, platform feature switches |
| **Support** (`/super-admin/support`) | Ticket inbox sorted worst-first, threaded replies, internal notes, resolve/reopen |
| **Marketing** (`/super-admin/marketing`) | Broadcast announcements to cafes, order-source attribution, campaigns cafes are running |

### Approving an affiliate payout
1. Go to **Affiliates**. Pending requests sit at the top under **Payout Requests**.
2. **Approve** settles the payout and deducts it from the partner's balance.
   **Decline** leaves the balance claimable.
3. A payout can only be settled once — approving twice is refused rather than
   paying twice.

### Answering a support ticket
1. Go to **Support**. Tickets needing attention are listed first; anything
   never answered is flagged **Never answered**.
2. Pick a ticket, then **Send reply** to answer the cafe — this moves the
   ticket to *Pending* and starts the response-time clock.
3. Tick **Internal note** to leave a note for your team instead. The cafe never
   sees it, and it does not count as a response.
4. **Resolve** when done; a cafe replying afterwards reopens the ticket.

### Sending an announcement
1. Go to **Marketing**, write a title and message.
2. Choose the audience — all cafes, on trial, paying, or past due. The list
   below shows how many cafes each audience currently reaches.
3. **Publish** sends it, or **Save as draft** to finish later.

### Changing platform pricing
Go to **Settings**. Edits are staged — the header shows how many unsaved
changes you have, and only the fields you actually changed are sent when you
**Save**. **Discard** reverts to the last saved values.

> **Maintenance mode** takes ordering offline for *every* cafe on the platform.
> Use it only during a planned window.
