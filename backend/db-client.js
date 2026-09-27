/**
 * Shared connection helper for the maintenance scripts in this directory
 * (check-db, seed-data, run-migration, ...).
 *
 * The connection string is read from the DATABASE_URL environment variable.
 * Never hardcode a credential here: these files are tracked in git.
 */

// dotenv is optional. If it is installed, backend/.env is loaded automatically
// (run the scripts from the backend/ directory). Otherwise export DATABASE_URL
// in your shell before running them.
try {
    require('dotenv').config();
} catch (err) {
    // dotenv not installed - DATABASE_URL must come from the shell environment.
}

const { neon } = require('@neondatabase/serverless');

function getDatabaseUrl() {
    const url = process.env.DATABASE_URL;

    if (!url) {
        console.error(
            'DATABASE_URL is not set.\n' +
            'Set it before running this script, for example:\n' +
            '  export DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"\n' +
            'or add it to backend/.env (see backend/.env.example).'
        );
        process.exit(1);
    }

    return url;
}

function getSql() {
    return neon(getDatabaseUrl());
}

module.exports = { getSql, getDatabaseUrl };
