const { getSql } = require('./db-client');
const crypto = require('crypto');

const sql = getSql();

const HASHED_PASSWORD = '$2b$10$EpRnTzVlqHNP0.fUbXUwSOal5wAllaRpTp.1x3/EnsPawL.9v.que';

async function resetAndSeed() {
    console.log('🔄 Resetting database and seeding...\n');

    try {
        // Drop all tables in reverse dependency order
        console.log('Dropping existing tables...');
        await sql.unsafe('DROP TABLE IF EXISTS "Session" CASCADE');
        await sql.unsafe('DROP TABLE IF EXISTS "OrderItem" CASCADE');
        await sql.unsafe('DROP TABLE IF EXISTS "Order" CASCADE');
        await sql.unsafe('DROP TABLE IF EXISTS "MenuItem" CASCADE');
        await sql.unsafe('DROP TABLE IF EXISTS "MenuCategory" CASCADE');
        await sql.unsafe('DROP TABLE IF EXISTS "User" CASCADE');
        await sql.unsafe('DROP TABLE IF EXISTS "Shop" CASCADE');
        await sql.unsafe('DROP TYPE IF EXISTS "Role" CASCADE');
        await sql.unsafe('DROP TYPE IF EXISTS "OrderStatus" CASCADE');
        await sql.unsafe('DROP TYPE IF EXISTS "OrderSource" CASCADE');
        await sql.unsafe('DROP TYPE IF EXISTS "PaymentMethod" CASCADE');
        console.log('✓ Tables dropped');

        // Create Enums
        console.log('\nCreating enums...');
        await sql.unsafe(`CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'CAFE_OWNER', 'MANAGER', 'CASHIER', 'CHEF', 'AFFILIATE', 'CUSTOMER')`);
        await sql.unsafe(`CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'HELD')`);
        await sql.unsafe(`CREATE TYPE "OrderSource" AS ENUM ('POS', 'QR_TABLE', 'QR_PICKUP', 'DELIVERY', 'MINI_APP')`);
        await sql.unsafe(`CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'SPLIT')`);
        console.log('✓ Enums created');

        // Create Shop table (minimal required columns only)
        console.log('\nCreating Shop table...');
        await sql.unsafe(`
            CREATE TABLE "Shop" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL,
                "slug" TEXT NOT NULL UNIQUE,
                "currency" TEXT NOT NULL DEFAULT '₹'
            )
        `);
        console.log('✓ Shop table created');

        // Create User table
        console.log('\nCreating User table...');
        await sql.unsafe(`
            CREATE TABLE "User" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "phone" TEXT NOT NULL UNIQUE,
                "email" TEXT UNIQUE,
                "name" TEXT,
                "password" TEXT NOT NULL,
                "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
                "shopId" TEXT REFERENCES "Shop"("id")
            )
        `);
        console.log('✓ User table created');

        // Create MenuCategory table
        console.log('\nCreating MenuCategory table...');
        await sql.unsafe(`
            CREATE TABLE "MenuCategory" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL,
                "shopId" TEXT NOT NULL REFERENCES "Shop"("id"),
                "sortOrder" INTEGER NOT NULL DEFAULT 0
            )
        `);
        console.log('✓ MenuCategory table created');

        // Create MenuItem table
        console.log('\nCreating MenuItem table...');
        await sql.unsafe(`
            CREATE TABLE "MenuItem" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL,
                "description" TEXT,
                "price" DOUBLE PRECISION NOT NULL,
                "isAvailable" BOOLEAN NOT NULL DEFAULT true,
                "categoryId" TEXT NOT NULL REFERENCES "MenuCategory"("id")
            )
        `);
        console.log('✓ MenuItem table created');

        // Create Order table
        console.log('\nCreating Order table...');
        await sql.unsafe(`
            CREATE TABLE "Order" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "shortId" TEXT NOT NULL,
                "shopId" TEXT NOT NULL REFERENCES "Shop"("id"),
                "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
                "source" "OrderSource" NOT NULL DEFAULT 'POS',
                "totalAmount" DOUBLE PRECISION NOT NULL,
                "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Order table created');

        // Create OrderItem table
        console.log('\nCreating OrderItem table...');
        await sql.unsafe(`
            CREATE TABLE "OrderItem" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "orderId" TEXT NOT NULL REFERENCES "Order"("id"),
                "menuItemId" TEXT NOT NULL REFERENCES "MenuItem"("id"),
                "quantity" INTEGER NOT NULL,
                "unitPrice" DOUBLE PRECISION NOT NULL
            )
        `);
        console.log('✓ OrderItem table created');

        // Now seed data
        console.log('\n🌱 Seeding data...');

        // Create Admin
        const adminId = crypto.randomUUID();
        await sql`INSERT INTO "User" ("id", "phone", "email", "name", "password", "role") VALUES (${adminId}, '+919999999999', 'admin@cafeos.com', 'Super Admin', ${HASHED_PASSWORD}, 'SUPER_ADMIN')`;
        console.log('✓ Admin: admin@cafeos.com / password');

        // Create Shop
        const shopId = crypto.randomUUID();
        await sql`INSERT INTO "Shop" ("id", "name", "slug", "currency") VALUES (${shopId}, 'Café Noir', 'cafe-noir', '₹')`;
        console.log('✓ Shop: Café Noir');

        // Create Owner
        const ownerId = crypto.randomUUID();
        await sql`INSERT INTO "User" ("id", "phone", "email", "name", "password", "role", "shopId") VALUES (${ownerId}, '+919876543210', 'owner@cafenoir.com', 'Raj Kumar', ${HASHED_PASSWORD}, 'CAFE_OWNER', ${shopId})`;
        console.log('✓ Owner: owner@cafenoir.com / password');

        // Create Categories
        const coffeeId = crypto.randomUUID();
        const foodId = crypto.randomUUID();
        await sql`INSERT INTO "MenuCategory" ("id", "name", "shopId", "sortOrder") VALUES (${coffeeId}, 'Coffee', ${shopId}, 1)`;
        await sql`INSERT INTO "MenuCategory" ("id", "name", "shopId", "sortOrder") VALUES (${foodId}, 'Food', ${shopId}, 2)`;
        console.log('✓ Categories: Coffee, Food');

        // Create Menu Items
        const items = [
            ['Espresso', 150, 'Strong Italian coffee', coffeeId],
            ['Cappuccino', 200, 'Espresso with foamed milk', coffeeId],
            ['Latte', 220, 'Smooth espresso with steamed milk', coffeeId],
            ['Americano', 180, 'Espresso with hot water', coffeeId],
            ['Mocha', 250, 'Chocolate espresso drink', coffeeId],
            ['Croissant', 120, 'Buttery French pastry', foodId],
            ['Sandwich', 180, 'Grilled veggie sandwich', foodId],
            ['Muffin', 100, 'Blueberry muffin', foodId],
            ['Brownie', 150, 'Chocolate brownie', foodId],
        ];

        for (const [name, price, desc, catId] of items) {
            await sql`INSERT INTO "MenuItem" ("id", "name", "description", "price", "categoryId") VALUES (${crypto.randomUUID()}, ${name}, ${desc}, ${price}, ${catId})`;
        }
        console.log(`✓ ${items.length} Menu items created`);

        console.log('\n🎉 Database reset and seeded successfully!');
        console.log('\n📝 Login credentials:');
        console.log('   Admin: admin@cafeos.com / password');
        console.log('   Owner: owner@cafenoir.com / password');

    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

resetAndSeed();
