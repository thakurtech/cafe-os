#!/usr/bin/env node
/**
 * Resets a user's password directly in the database.
 *
 * Needed because a deployment that booted the old code has a SUPER_ADMIN account
 * (admin@cafeos.com) whose password was hardcoded in the source. Changing the
 * seeding logic does not rotate an account that already exists.
 *
 * Reads the connection string from DATABASE_URL. The password is never taken as
 * a command-line argument, where it would land in shell history -- it is typed
 * at a prompt, with the input hidden on a terminal.
 *
 * Usage:
 *   cd backend
 *   DATABASE_URL="postgresql://..." node scripts/reset-super-admin-password.js
 *   DATABASE_URL="postgresql://..." node scripts/reset-super-admin-password.js someone@else.com
 */

const readline = require('readline');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const MIN_LENGTH = 12;

/**
 * Line reader that works for both an interactive terminal and piped input.
 *
 * Piped input needs the buffering: readline can deliver every line before the
 * second prompt is asked, and then close, so a naive `rl.question` chain leaves
 * the second callback waiting forever and the process exits silently.
 */
function createPrompter() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const waiting = [];
    const buffered = [];
    let closed = false;
    let currentPrompt = '';

    if (process.stdin.isTTY) {
        // Echo the prompt but not what is typed. Only meaningful on a terminal;
        // suppressing output for piped input swallowed the answer entirely.
        rl._writeToOutput = function (str) {
            if (str.includes(currentPrompt)) {
                rl.output.write(currentPrompt);
            }
        };
    }

    rl.on('line', (line) => {
        const next = waiting.shift();
        if (next) next(line);
        else buffered.push(line);
    });

    rl.on('close', () => {
        closed = true;
        while (waiting.length) waiting.shift()(null);
    });

    return {
        ask(question) {
            currentPrompt = question;
            process.stdout.write(question);

            if (buffered.length > 0) {
                if (process.stdin.isTTY) process.stdout.write('\n');
                return Promise.resolve(buffered.shift());
            }
            if (closed) return Promise.resolve(null);

            return new Promise((resolve) => {
                waiting.push((line) => {
                    if (process.stdin.isTTY) process.stdout.write('\n');
                    resolve(line);
                });
            });
        },
        close() {
            rl.close();
        },
    };
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is not set.\n');
        console.error('Run it like this, with your connection string in quotes:');
        console.error('  DATABASE_URL="postgresql://..." node scripts/reset-super-admin-password.js');
        process.exit(1);
    }

    const email = (process.argv[2] || 'admin@cafeos.com').trim();
    const prisma = new PrismaClient();

    try {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, role: true, name: true },
        });

        if (!user) {
            console.error(`No user found with email ${email}.`);
            console.error('Pass a different address as the first argument if the admin was renamed.');
            process.exit(1);
        }

        console.log('\nAbout to reset the password for:');
        console.log(`  ${user.email}  (role: ${user.role}, name: ${user.name ?? 'unnamed'})\n`);

        const prompter = createPrompter();
        let password;
        let confirm;
        try {
            password = await prompter.ask(`New password (at least ${MIN_LENGTH} characters): `);
            confirm = await prompter.ask('Confirm new password: ');
        } finally {
            prompter.close();
        }

        if (password === null || confirm === null) {
            console.error('\nDid not receive two lines of input. Nothing was changed.');
            process.exit(1);
        }
        if (password !== confirm) {
            console.error('\nThe two entries did not match. Nothing was changed.');
            process.exit(1);
        }
        if (password.trim().length < MIN_LENGTH) {
            console.error(`\nPassword must be at least ${MIN_LENGTH} characters. Nothing was changed.`);
            process.exit(1);
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { password: await bcrypt.hash(password.trim(), 10) },
        });

        console.log(`\nDone. ${user.email} now uses the password you just entered.`);
        console.log('Existing sessions keep working until their tokens expire.');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('\nFailed to reset the password:', error.message);
    process.exit(1);
});
