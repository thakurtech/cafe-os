const { getSql } = require('./db-client');
const crypto = require('crypto');

const sql = getSql();

function uuid() {
    return crypto.randomUUID();
}

async function seedShopAndMenu() {
    console.log('🌱 Creating Shop and Menu items...\n');

    try {
        // 1. Create Shop
        const shopId = uuid();
        console.log('Inserting shop...');
        await sql.unsafe(`
            INSERT INTO "Shop" ("id", "name", "slug", "address", "phone", "currency", "themeColor", "upiId", "createdAt", "updatedAt")
            VALUES ('${shopId}', 'Café Noir', 'cafe-noir', '123 Coffee Street, Bangalore', '+919876543210', '₹', '#BF5700', 'cafenoir@upi', NOW(), NOW())
        `);
        console.log('✓ Shop created: Café Noir');

        // 2. Create Categories
        const coffeeId = uuid();
        const foodId = uuid();
        console.log('\nInserting categories...');
        await sql.unsafe(`INSERT INTO "MenuCategory" ("id", "name", "shopId", "sortOrder") VALUES ('${coffeeId}', 'Coffee', '${shopId}', 1)`);
        await sql.unsafe(`INSERT INTO "MenuCategory" ("id", "name", "shopId", "sortOrder") VALUES ('${foodId}', 'Food', '${shopId}', 2)`);
        console.log('✓ Categories: Coffee, Food');

        // 3. Create Menu Items
        console.log('\nInserting menu items...');
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
            await sql.unsafe(`
                INSERT INTO "MenuItem" ("id", "name", "description", "price", "categoryId", "isAvailable", "popularityScore", "margin")
                VALUES ('${uuid()}', '${name}', '${desc}', ${price}, '${catId}', true, 0, 0)
            `);
            process.stdout.write('.');
        }
        console.log(`\n✓ Created ${items.length} menu items`);

        console.log('\n🎉 Shop and Menu seeded successfully!');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.message.includes('duplicate key') || error.message.includes('already exists')) {
            console.log('(Data may already exist - that\'s OK!)');
        }
    }
}

seedShopAndMenu();
