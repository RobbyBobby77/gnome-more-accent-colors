// Color math: parsing, OKLab/OKLCh conversion, and the two rules that have to
// agree with libadwaita rather than with our own taste.

import {ok, eq, section, finish} from './harness.js';
import {
    SYSTEM_COLORS, EXTRA_COLORS, ALL_COLORS,
    parseHex, toHex, oklabLightness, hexToOklch, oklchToHex,
    foregroundFor, standaloneExpr, resolveSelection, nearestSystemAccent,
} from '../more-accent-colors@robbybobby.local/lib/colors.js';

section('parsing');
eq('parseHex 6-digit', toHex(parseHex('#4f46e5')), '#4f46e5');
eq('parseHex 3-digit expands', toHex(parseHex('#abc')), '#aabbcc');
eq('parseHex tolerates no hash', toHex(parseHex('4f46e5')), '#4f46e5');
eq('parseHex uppercase', toHex(parseHex('#F2643F')), '#f2643f');
ok('parseHex rejects garbage', parseHex('not-a-color') === null);
ok('parseHex rejects wrong length', parseHex('#12345') === null);
eq('toHex clamps high', toHex({r: 999, g: -5, b: 128}), '#ff0080');

section('palette integrity');
eq('9 system colors', SYSTEM_COLORS.length, 9);
eq('17 added colors', EXTRA_COLORS.length, 17);
ok('all ids unique', new Set(ALL_COLORS.map(c => c.id)).size === ALL_COLORS.length);
ok('all hex values parse', ALL_COLORS.every(c => parseHex(c.hex) !== null));
ok('system ids match GNOME enum',
    SYSTEM_COLORS.map(c => c.id).join() ===
    'blue,teal,green,yellow,orange,red,pink,purple,slate');

section('OKLCh round-trip');
let worstDrift = 0;
for (const {hex} of ALL_COLORS) {
    const back = oklchToHex(hexToOklch(hex));
    for (let i = 1; i < 7; i += 2) {
        worstDrift = Math.max(worstDrift,
            Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(back.slice(i, i + 2), 16)));
    }
}
ok(`round-trips all ${ALL_COLORS.length} colors within 1/255 (worst ${worstDrift})`,
    worstDrift <= 1, `worst channel drift was ${worstDrift}`);

ok('oklchToHex clamps out-of-gamut chroma into sRGB', (() => {
    // Absurd chroma at a hue sRGB cannot reach; must still yield a valid color.
    const hex = oklchToHex({L: 0.6, C: 0.9, H: 140});
    return /^#[0-9a-f]{6}$/.test(hex) && parseHex(hex) !== null;
})());

section('lightness');
ok('white is lightest', oklabLightness('#ffffff') > 0.99);
ok('black is darkest', oklabLightness('#000000') < 0.01);
ok('yellow is the lightest system accent',
    Math.max(...SYSTEM_COLORS.map(c => oklabLightness(c.hex))) === oklabLightness('#c88800'));

section('foreground rule (must match libadwaita)');
// libadwaita hardcodes `accent_fg_color: white` for all nine of its accents.
const wrong = SYSTEM_COLORS.filter(c => foregroundFor(c.hex) !== '#ffffff');
ok('every GNOME system accent gets white text', wrong.length === 0,
    `these got dark text: ${wrong.map(c => c.id).join(', ')}`);
eq('pure white gets dark text', foregroundFor('#ffffff'), 'rgba(0, 0, 0, 0.85)');
eq('pure yellow gets dark text', foregroundFor('#ffff00'), 'rgba(0, 0, 0, 0.85)');
eq('black gets white text', foregroundFor('#000000'), '#ffffff');
eq('invalid input falls back to white', foregroundFor('nonsense'), '#ffffff');

section('standalone accent (libadwaita formula)');
eq('light clamps lightness down',
    standaloneExpr('#4f46e5', false), 'oklab(from #4f46e5 min(l, 0.5) a b)');
eq('dark clamps lightness up',
    standaloneExpr('#4f46e5', true), 'oklab(from #4f46e5 max(l, 0.85) a b)');

section('nearest system accent');
// Apps that read the accent programmatically can only be handed one of the nine.
for (const {id, hex} of SYSTEM_COLORS)
    eq(`${id} maps to itself`, nearestSystemAccent(hex), id);
// indigo sits at hue 277, between blue (255) and purple (317), and lands on blue.
eq('indigo -> blue', nearestSystemAccent('#4f46e5'), 'blue');
eq('violet -> purple', nearestSystemAccent('#7c3aed'), 'purple');
eq('crimson -> red', nearestSystemAccent('#c01c28'), 'red');
eq('mint -> green', nearestSystemAccent('#2fb98a'), 'green');
eq('turquoise -> teal', nearestSystemAccent('#0eaaa0'), 'teal');
eq('gold -> yellow', nearestSystemAccent('#bf9b30'), 'yellow');
eq('coral -> orange', nearestSystemAccent('#f2643f'), 'orange');
eq('graphite -> slate', nearestSystemAccent('#5b5b66'), 'slate');
ok('always returns one of the nine',
    EXTRA_COLORS.every(c => SYSTEM_COLORS.some(s => s.id === nearestSystemAccent(c.hex))));
eq('invalid input is inert', nearestSystemAccent('nonsense'), null);

section('selection resolution');
eq('system means hands off', resolveSelection('system', '#123456'), null);
eq('palette id resolves', resolveSelection('indigo', '#123456'), '#4f46e5');
eq('custom uses custom-color', resolveSelection('custom', '#abc'), '#aabbcc');
eq('unknown id is inert', resolveSelection('nope', '#123456'), null);
eq('invalid custom color is inert', resolveSelection('custom', 'not-a-color'), null);

finish('colors');
