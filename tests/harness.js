// Minimal test harness. No framework - these run under plain gjs so they work
// on any machine that can run the extension itself.

import System from 'system';

let passed = 0;
let failed = 0;
let skipped = 0;

export function ok(label, condition, detail) {
    if (condition) {
        passed++;
        print(`  ok    ${label}`);
    } else {
        failed++;
        print(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`);
    }
}

export function eq(label, actual, expected) {
    ok(label, actual === expected, `expected: ${expected}\n          actual:   ${actual}`);
}

export function skip(label, why) {
    skipped++;
    print(`  skip  ${label} (${why})`);
}

export function section(name) {
    print(`\n${name}`);
}

/** Print the tally and exit nonzero if anything failed, so `make test` fails too. */
export function finish(suite) {
    const bits = [`${passed} passed`];
    if (failed)
        bits.push(`${failed} failed`);
    if (skipped)
        bits.push(`${skipped} skipped`);
    print(`\n${suite}: ${bits.join(', ')}`);
    System.exit(failed > 0 ? 1 : 0);
}
