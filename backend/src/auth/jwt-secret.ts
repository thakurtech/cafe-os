/**
 * Resolves the secret used to sign and verify JWTs.
 *
 * Both the JwtModule and the passport strategy previously fell back to the
 * literal 'your-secret-key'. A deployment that forgot to set JWT_SECRET would
 * therefore sign tokens with a value published in this repository, and anyone
 * could mint a token carrying `role: SUPER_ADMIN`. So in production a missing
 * or obviously-placeholder secret is a hard boot failure rather than a silent
 * downgrade.
 *
 * Outside production a generated per-process secret is used instead, so a
 * fresh clone still runs without setup. It changes on every restart, which
 * invalidates previously issued dev tokens — that is deliberate: it keeps the
 * insecure path from ever looking like a working one.
 */

import { randomBytes } from 'crypto';

const PLACEHOLDER_SECRETS = [
    'your-secret-key',
    'secret',
    'changeme',
    'change-me',
    'jwt-secret',
    // The literal shipped in backend/.env.example. It is long enough to pass the
    // length check, so without this a deployment that copied the template
    // verbatim would be signing tokens with a value published in this repo --
    // exactly the failure this module exists to prevent.
    'your-super-secret-jwt-key-change-this-in-production-123456789',
];

/**
 * Substring markers that give away a template value. Caught in addition to the
 * exact list above, so a lightly-edited placeholder is still rejected.
 */
const PLACEHOLDER_MARKERS = ['change-this', 'change-me', 'changeme', 'your-secret', 'yoursecret'];

const MIN_SECRET_LENGTH = 16;

export function resolveJwtSecret(
    env: Record<string, string | undefined> = process.env,
    generate: () => string = () => randomBytes(32).toString('hex'),
): string {
    const isProduction = env.NODE_ENV === 'production';
    const secret = env.JWT_SECRET?.trim();

    if (secret && !isPlaceholder(secret) && secret.length >= MIN_SECRET_LENGTH) {
        return secret;
    }

    if (isProduction) {
        throw new Error(
            secret
                ? 'JWT_SECRET is a placeholder or shorter than 16 characters. Set a strong, random JWT_SECRET before starting in production.'
                : 'JWT_SECRET is not set. Set a strong, random JWT_SECRET before starting in production.',
        );
    }

    // Development only. Loud on purpose: a silent fallback is how the insecure
    // default survived this long.
    console.warn(
        '\x1b[33m[auth] JWT_SECRET is not set to a usable value. Using a random secret for this process only.\n' +
        '       Tokens will stop working when the server restarts. Set JWT_SECRET in backend/.env to keep sessions.\x1b[0m',
    );

    return generate();
}

function isPlaceholder(secret: string): boolean {
    const normalised = secret.toLowerCase();
    return (
        PLACEHOLDER_SECRETS.includes(normalised) ||
        PLACEHOLDER_MARKERS.some((marker) => normalised.includes(marker))
    );
}

/**
 * Resolved once per process so the module and the strategy always agree.
 * If they disagreed, every token the app issued would fail its own verification.
 */
export const JWT_SECRET = resolveJwtSecret();
