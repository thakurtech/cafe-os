const { getSql } = require('./db-client');

const sql = getSql();

async function test() {
    try {
        const result = await sql`SELECT 1 as test`;
        console.log('SUCCESS! Connected to Neon:', result);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();
