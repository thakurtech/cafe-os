const { getSql } = require('./db-client');
const sql = getSql();

async function check() {
    console.log('Checking database...\n');

    const shops = await sql`SELECT * FROM "Shop" LIMIT 5`;
    console.log('Shops:', shops);

    const users = await sql`SELECT id, email, role FROM "User" LIMIT 5`;
    console.log('Users:', users);

    const cats = await sql`SELECT * FROM "MenuCategory" LIMIT 5`;
    console.log('Categories:', cats);

    const items = await sql`SELECT id, name, price FROM "MenuItem" LIMIT 5`;
    console.log('Menu Items:', items);
}

check().catch(e => console.error('Error:', e.message));
