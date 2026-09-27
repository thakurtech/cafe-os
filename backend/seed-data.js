const { getSql } = require('./db-client');
const crypto = require('crypto');

const sql = getSql();

// Pre-computed bcrypt hash for "password"
const HASHED_PASSWORD = '$2b$10$EpRnTzVlqHNP0.fUbXUwSOal5wAllaRpTp.1x3/EnsPawL.9v.que';

function uuid() {
    return crypto.randomUUID();
}

async function seedDatabase() {
    console.log('🌱 Seeding CaféOS database...\n');

    try {
        // 1. Create Demo Shop FIRST (before users that reference it)
        const shopId = uuid();
        console.log('Creating Demo Shop...');
        await sql`
            INSERT INTO "Shop" ("id", "name", "slug", "address", "phone", "currency", "themeColor", "upiId")
            VALUES (${shopId}, 'Café Noir', 'cafe-noir', '123 Coffee Street, Bangalore', '+919876543210', '₹', '#BF5700', 'cafenoir@upi')
            ON CONFLICT ("slug") DO UPDATE SET "name" = 'Café Noir'
            RETURNING "id"
        `;
        console.log('✓ Shop: Café Noir');

        // Get the shop if it already existed
        const existingShop = await sql`SELECT "id" FROM "Shop" WHERE "slug" = 'cafe-noir' LIMIT 1`;
        const finalShopId = existingShop[0]?.id || shopId;

        // 2. Create Super Admin (no shopId)
        console.log('\nCreating Super Admin...');
        await sql`
            INSERT INTO "User" ("id", "phone", "email", "name", "password", "role")
            VALUES (${uuid()}, '+919999999999', 'admin@cafeos.com', 'Super Admin', ${HASHED_PASSWORD}, 'SUPER_ADMIN')
            ON CONFLICT ("phone") DO NOTHING
        `;
        console.log('✓ Super Admin: admin@cafeos.com / password');

        // 3. Create Shop Owner (with shopId)
        console.log('\nCreating Shop Owner...');
        await sql`
            INSERT INTO "User" ("id", "phone", "email", "name", "password", "role", "shopId")
            VALUES (${uuid()}, '+919876543211', 'owner@cafenoir.com', 'Raj Kumar', ${HASHED_PASSWORD}, 'CAFE_OWNER', ${finalShopId})
            ON CONFLICT ("phone") DO NOTHING
        `;
        console.log('✓ Owner: owner@cafenoir.com / password');

        // 4. Check if categories exist
        const existingCats = await sql`SELECT COUNT(*) as count FROM "MenuCategory" WHERE "shopId" = ${finalShopId}`;

        if (parseInt(existingCats[0].count) === 0) {
            // Create Categories
            console.log('\nCreating Menu Categories...');
            const coffeeId = uuid();
            const foodId = uuid();

            await sql`INSERT INTO "MenuCategory" ("id", "name", "shopId", "sortOrder") VALUES (${coffeeId}, 'Coffee', ${finalShopId}, 1)`;
            await sql`INSERT INTO "MenuCategory" ("id", "name", "shopId", "sortOrder") VALUES (${foodId}, 'Food', ${finalShopId}, 2)`;
            console.log('✓ Categories: Coffee, Food');

            // Create Menu Items
            console.log('\nCreating Menu Items...');
            const items = [
                { name: 'Espresso', price: 150, desc: 'Strong Italian coffee', cat: coffeeId },
                { name: 'Cappuccino', price: 200, desc: 'Espresso with foamed milk', cat: coffeeId },
                { name: 'Latte', price: 220, desc: 'Smooth espresso with steamed milk', cat: coffeeId },
                { name: 'Americano', price: 180, desc: 'Espresso with hot water', cat: coffeeId },
                { name: 'Mocha', price: 250, desc: 'Chocolate espresso drink', cat: coffeeId },
                { name: 'Croissant', price: 120, desc: 'Buttery French pastry', cat: foodId },
                { name: 'Sandwich', price: 180, desc: 'Grilled veggie sandwich', cat: foodId },
                { name: 'Muffin', price: 100, desc: 'Blueberry muffin', cat: foodId },
                { name: 'Brownie', price: 150, desc: 'Chocolate brownie', cat: foodId },
            ];

            for (const item of items) {
                await sql`
                    INSERT INTO "MenuItem" ("id", "name", "description", "price", "categoryId", "isAvailable")
                    VALUES (${uuid()}, ${item.name}, ${item.desc}, ${item.price}, ${item.cat}, true)
                `;
            }
            console.log(`✓ Created ${items.length} menu items`);
        } else {
            console.log('\n✓ Menu already exists, skipping...');
        }

        console.log('\n🎉 Database seeded successfully!');
        console.log('\n📝 Login credentials:');
        console.log('   Admin: admin@cafeos.com / password');
        console.log('   Owner: owner@cafenoir.com / password');

    } catch (error) {
        console.error('Error:', error.message);
        console.error('Details:', error);
    }
}

seedDatabase();
