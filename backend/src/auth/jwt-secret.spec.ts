import { resolveJwtSecret } from './jwt-secret';

const STRONG = 'a'.repeat(32);

describe('resolveJwtSecret', () => {
    const generate = () => 'generated-dev-secret';
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('uses a strong configured secret in any environment', () => {
        expect(resolveJwtSecret({ JWT_SECRET: STRONG, NODE_ENV: 'production' }, generate)).toBe(
            STRONG,
        );
        expect(resolveJwtSecret({ JWT_SECRET: STRONG, NODE_ENV: 'development' }, generate)).toBe(
            STRONG,
        );
    });

    it('trims surrounding whitespace from the configured secret', () => {
        expect(
            resolveJwtSecret({ JWT_SECRET: `  ${STRONG}  `, NODE_ENV: 'production' }, generate),
        ).toBe(STRONG);
    });

    describe('in production', () => {
        const prod = (JWT_SECRET?: string) =>
            resolveJwtSecret({ JWT_SECRET, NODE_ENV: 'production' }, generate);

        it('refuses to boot with no secret', () => {
            expect(() => prod(undefined)).toThrow(/JWT_SECRET is not set/);
        });

        it('refuses to boot with an empty or whitespace secret', () => {
            expect(() => prod('')).toThrow(/JWT_SECRET is not set/);
            expect(() => prod('   ')).toThrow(/JWT_SECRET is not set/);
        });

        it('refuses the placeholder that used to be the fallback', () => {
            // This is the exact value the code shipped with. Anyone could forge
            // a SUPER_ADMIN token against it.
            expect(() => prod('your-secret-key')).toThrow(/placeholder/);
            expect(() => prod('YOUR-SECRET-KEY')).toThrow(/placeholder/);
        });

        it('refuses other common placeholders', () => {
            ['secret', 'changeme', 'change-me', 'jwt-secret'].forEach((value) => {
                expect(() => prod(value)).toThrow(/placeholder/);
            });
        });

        it('refuses a secret shorter than 16 characters', () => {
            expect(() => prod('short')).toThrow(/16 characters/);
            expect(() => prod('a'.repeat(15))).toThrow(/16 characters/);
        });

        it('accepts a secret of exactly 16 characters', () => {
            expect(prod('b'.repeat(16))).toBe('b'.repeat(16));
        });

        it('never falls back to a generated secret in production', () => {
            expect(() => prod(undefined)).toThrow();
            // Falling back would mean every restart silently invalidates all tokens.
            expect(prod(STRONG)).not.toBe('generated-dev-secret');
        });
    });

    describe('outside production', () => {
        it('generates a secret and warns when none is configured', () => {
            expect(resolveJwtSecret({ NODE_ENV: 'development' }, generate)).toBe(
                'generated-dev-secret',
            );
            expect(warn).toHaveBeenCalled();
        });

        it('generates a secret rather than accepting the placeholder', () => {
            expect(
                resolveJwtSecret({ JWT_SECRET: 'your-secret-key', NODE_ENV: 'development' }, generate),
            ).toBe('generated-dev-secret');
        });

        it('treats an unset NODE_ENV as development', () => {
            expect(resolveJwtSecret({}, generate)).toBe('generated-dev-secret');
        });
    });
});
