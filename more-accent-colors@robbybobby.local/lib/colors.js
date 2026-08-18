// Palette definitions and color math.
//
// This module is imported by both extension.js and prefs.js, so it must stay
// free of any Shell-only or Gtk-only imports.

/** The nine accents GNOME already ships, kept so they can be forced per-user. */
export const SYSTEM_COLORS = [
    {id: 'blue', name: 'Blue', hex: '#3584e4'},
    {id: 'teal', name: 'Teal', hex: '#2190a4'},
    {id: 'green', name: 'Green', hex: '#3a944a'},
    {id: 'yellow', name: 'Yellow', hex: '#c88800'},
    {id: 'orange', name: 'Orange', hex: '#ed5b00'},
    {id: 'red', name: 'Red', hex: '#e62d42'},
    {id: 'pink', name: 'Pink', hex: '#d56199'},
    {id: 'purple', name: 'Purple', hex: '#9141ac'},
    {id: 'slate', name: 'Slate', hex: '#6f8396'},
];

/** The colors this extension adds. */
export const EXTRA_COLORS = [
    {id: 'indigo', name: 'Indigo', hex: '#4f46e5'},
    {id: 'violet', name: 'Violet', hex: '#7c3aed'},
    {id: 'lavender', name: 'Lavender', hex: '#9b87d8'},
    {id: 'magenta', name: 'Magenta', hex: '#c2259b'},
    {id: 'rose', name: 'Rose', hex: '#e11d62'},
    {id: 'maroon', name: 'Maroon', hex: '#a12f4b'},
    {id: 'brown', name: 'Brown', hex: '#8b5e3c'},
    {id: 'olive', name: 'Olive', hex: '#6f8b2a'},
    {id: 'lime', name: 'Lime', hex: '#5aa02c'},
    {id: 'emerald', name: 'Emerald', hex: '#0e9f6e'},
    {id: 'mint', name: 'Mint', hex: '#2fb98a'},
    {id: 'turquoise', name: 'Turquoise', hex: '#0eaaa0'},
    {id: 'cyan', name: 'Cyan', hex: '#0a9fc4'},
    {id: 'amber', name: 'Amber', hex: '#e59500'},
    {id: 'gold', name: 'Gold', hex: '#bf9b30'},
    {id: 'coral', name: 'Coral', hex: '#f2643f'},
    {id: 'graphite', name: 'Graphite', hex: '#5b5b66'},
];

export const ALL_COLORS = [...SYSTEM_COLORS, ...EXTRA_COLORS];

/**
 * OKLab lightness above which an accent is too bright to carry white text.
 *
 * libadwaita hardcodes `accent_fg_color: white` for all nine of its accents,
 * the lightest being yellow at L=0.674. The cutoff sits just above that, so
 * every system color still resolves to white while genuinely light custom
 * picks (a bright amber, say) get dark text instead.
 */
const FG_LIGHTNESS_CUTOFF = 0.70;

export function parseHex(hex) {
    let s = String(hex).trim().replace(/^#/, '');
    if (s.length === 3)
        s = [...s].map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(s))
        return null;
    return {
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16),
    };
}

export function toHex({r, g, b}) {
    const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

const srgbToLinear = v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = v => {
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return s * 255;
};

function rgbToOklab({r, g, b}) {
    const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);

    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

    return {
        L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    };
}

function oklabToRgb({L, a, b}) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;

    return {
        r: linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    };
}

/** Perceptual lightness (the L of OKLab), the same axis libadwaita reasons in. */
export function oklabLightness(hex) {
    const rgb = parseHex(hex);
    return rgb ? rgbToOklab(rgb).L : 0;
}

/** Polar OKLab: lightness, chroma, and hue in degrees. */
export function hexToOklch(hex) {
    const rgb = parseHex(hex);
    if (!rgb)
        return null;
    const {L, a, b} = rgbToOklab(rgb);
    return {
        L,
        C: Math.hypot(a, b),
        H: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360,
    };
}

const inGamut = ({r, g, b}) => [r, g, b].every(v => v >= -0.5 && v <= 255.5);

/**
 * Back to a hex string. Colors that land outside sRGB have their chroma walked
 * down until they fit, which keeps the hue and lightness the recolor asked for
 * rather than letting a channel clip and skew the hue.
 */
export function oklchToHex({L, C, H}) {
    const clampedL = Math.max(0, Math.min(1, L));
    const rad = H * Math.PI / 180;
    const at = chroma => oklabToRgb({
        L: clampedL,
        a: Math.cos(rad) * chroma,
        b: Math.sin(rad) * chroma,
    });

    if (inGamut(at(C)))
        return toHex(at(C));

    let lo = 0, hi = C;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (inGamut(at(mid)))
            lo = mid;
        else
            hi = mid;
    }
    return toHex(at(lo));
}

/** Foreground color for text drawn on top of a filled accent surface. */
export function foregroundFor(hex) {
    return oklabLightness(hex) <= FG_LIGHTNESS_CUTOFF ? '#ffffff' : 'rgba(0, 0, 0, 0.85)';
}

/**
 * CSS for the standalone accent - the one used for text and icons sitting
 * directly on the window background, rather than on an accent-filled surface.
 *
 * This is libadwaita's own formula verbatim, so links and selected labels end
 * up the exact shade Adwaita would have produced for a built-in accent. GTK
 * evaluates the relative-color syntax itself; St has no oklab(), which is why
 * this is GTK-only.
 */
export function standaloneExpr(hex, dark) {
    const clamp = dark ? 'max(l, 0.85)' : 'min(l, 0.5)';
    return `oklab(from ${hex} ${clamp} a b)`;
}

/**
 * The closest of GNOME's nine built-in accents, by Euclidean distance in OKLab.
 *
 * Some apps never look at the stylesheet - they call
 * adw_style_manager_get_accent_color(), or read the org.freedesktop.appearance
 * accent-color portal key, both of which resolve from the GSettings enum rather
 * than from CSS. Flatpak apps cannot read our gtk.css at all. Those consumers
 * can only ever be given one of the nine, so we hand them the nearest match
 * instead of leaving them on an unrelated color.
 */
export function nearestSystemAccent(hex) {
    const rgb = parseHex(hex);
    if (!rgb)
        return null;

    const target = rgbToOklab(rgb);
    let best = null;
    let bestDistance = Infinity;

    for (const candidate of SYSTEM_COLORS) {
        const c = rgbToOklab(parseHex(candidate.hex));
        const distance =
            (target.L - c.L) ** 2 + (target.a - c.a) ** 2 + (target.b - c.b) ** 2;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate.id;
        }
    }
    return best;
}

/**
 * Return the saved accent only while the system still holds the value we set.
 * An empty applied value is accepted for migration from releases which only
 * persisted saved-system-accent.
 */
export function restorableSystemAccent(saved, applied, current) {
    if (!saved)
        return null;
    return !applied || current === applied ? saved : null;
}

/** Resolve the settings pair (accent-color, custom-color) to a hex, or null for "system". */
export function resolveSelection(id, customHex) {
    if (id === 'system')
        return null;
    if (id === 'custom')
        return parseHex(customHex) ? toHex(parseHex(customHex)) : null;
    const entry = ALL_COLORS.find(c => c.id === id);
    return entry ? entry.hex : null;
}
