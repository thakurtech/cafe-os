const { getSql } = require('./db-client');

const sql = getSql();

async function createTables() {
    console.log('🚀 Creating CaféOS database tables via Neon Serverless...\n');

    const statements = [
        // Create Enums
        `CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'CAFE_OWNER', 'MANAGER', 'CASHIER', 'CHEF', 'AFFILIATE', 'CUSTOMER')`,
        `CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'HELD')`,
        `CREATE TYPE "OrderSource" AS ENUM ('POS', 'QR_TABLE', 'QR_PICKUP', 'DELIVERY', 'MINI_APP')`,
        `CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'SPLIT')`,

        // Create Shop table
        `CREATE TABLE "Shop" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "slug" TEXT NOT NULL UNIQUE,
            "address" TEXT,
            "phone" TEXT,
            "email" TEXT,
            "logo" TEXT,
            "themeColor" TEXT DEFAULT '#BF5700',
            "currency" TEXT NOT NULL DEFAULT '₹',
            "upiId" TEXT,
            "gstNumber" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,

        // Create User table
        `CREATE TABLE "User" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "phone" TEXT NOT NULL UNIQUE,
            "name" TEXT,
            "email" TEXT UNIQUE,
            "password" TEXT NOT NULL DEFAULT '$2b$10$EpRnTzVlqHNP0.fUbXUwSOal5wAllaRpTp.1x3/EnsPawL.9v.que',
            "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
            "shopId" TEXT REFERENCES "Shop"("id"),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,

        // Create MenuCategory table
        `CREATE TABLE "MenuCategory" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "shopId" TEXT NOT NULL REFERENCES "Shop"("id"),
            "sortOrder" INTEGER NOT NULL DEFAULT 0
        )`,

        // Create MenuItem table
        `CREATE TABLE "MenuItem" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "description" TEXT,
            "price" DOUBLE PRECISION NOT NULL,
            "image" TEXT,
            "isAvailable" BOOLEAN NOT NULL DEFAULT true,
            "categoryId" TEXT NOT NULL REFERENCES "MenuCategory"("id"),
            "popularityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
            "margin" DOUBLE PRECISION NOT NULL DEFAULT 0
        )`,

        // Create Order table
        `CREATE TABLE "Order" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "shortId" TEXT NOT NULL,
            "shopId" TEXT NOT NULL REFERENCES "Shop"("id"),
            "customerId" TEXT REFERENCES "User"("id"),
            "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
            "source" "OrderSource" NOT NULL DEFAULT 'POS',
            "totalAmount" DOUBLE PRECISION NOT NULL,
            "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
            "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
            "paidAt" TIMESTAMP(3),
            "discountCode" TEXT,
            "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
            "tableNumber" TEXT,
            "notes" TEXT,
            "cashierId" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,

        // Create OrderItem table
        `CREATE TABLE "OrderItem" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "orderId" TEXT NOT NULL REFERENCES "Order"("id"),
            "menuItemId" TEXT NOT NULL REFERENCES "MenuItem"("id"),
            "quantity" INTEGER NOT NULL,
            "unitPrice" DOUBLE PRECISION NOT NULL,
            "notes" TEXT
        )`,

        // Create Session table (for auth)
        `CREATE TABLE "Session" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "userId" TEXT NOT NULL REFERENCES "User"("id"),
            "token" TEXT NOT NULL UNIQUE,
            "expiresAt" TIMESTAMP(3) NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    let success = 0, skipped = 0, errors = 0;

    for (const statement of statements) {
        try {
            await sql.unsafe(statement);
            success++;
            console.log('✓');
        } catch (error) {
            if (error.message.includes('already exists')) {
                skipped++;
                console.log('s (exists)');
            } else {
                errors++;
                console.log('✗ Error:', error.message.substring(0, 100));
            }
        }
    }

    console.log(`\n✅ Database setup complete!`);
    console.log(`   Success: ${success}, Skipped: ${skipped}, Errors: ${errors}`);
}

createTables().catch(console.error);
