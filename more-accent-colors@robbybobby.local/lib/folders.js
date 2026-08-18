// Recolors the folder icons to match the accent.
//
// Folder icons are not styleable - Adwaita draws them as SVGs with a hardcoded
// blue palette (#438de6 for the back, a #62a0ea gradient, #a4caee for the front
// face), so the only way to tint them is to produce recolored copies.
//
// Those copies go into ~/.local/share/icons/<theme>/, which shadows the system
// theme of the same name at every size without touching the icon-theme setting.
// That matters for the failure mode: if this extension is force-removed, the
// icons simply revert. Pointing icon-theme at a generated theme would instead
// leave a dangling setting and broken icons.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {hexToOklch, oklchToHex} from './colors.js';

/** The accent these icons are drawn for; recoloring is expressed as a delta from it. */
const REFERENCE_ACCENT = '#3584e4';

/**
 * Every context directory under scalable/ is scanned rather than a fixed list.
 * A plain directory resolves to "inode-directory" before "folder", and that icon
 * lives in mimetypes/ rather than places/ - hardcoding contexts silently missed
 * it and left ordinary folders unrecolored while the special ones changed.
 * Scanning is also cheap: Adwaita has about 70 scalable SVGs.
 */

/** Icon sizes to publish into. Adwaita only declares these two. */
const SIZE_DIRS = ['scalable', '16x16'];

/**
 * How many of the base palette's colors an SVG must use before we treat it as a
 * folder. Adwaita's network-workgroup icon happens to share one blue with the
 * folder palette, so a single match is not enough.
 */
const MIN_PALETTE_MATCHES = 3;

const MANIFEST = () => GLib.build_filenamev(
    [GLib.get_user_cache_dir(), 'more-accent-colors', 'folders.manifest']);

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

function readText(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(bytes) : null;
    } catch {
        return null;
    }
}

function writeText(path, text) {
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
    return GLib.file_set_contents(path, text);
}

/** System icon directories, user ones excluded so we never read our own output. */
function systemIconDirs() {
    const dirs = GLib.get_system_data_dirs().map(d => GLib.build_filenamev([d, 'icons']));
    if (!dirs.includes('/usr/share/icons'))
        dirs.push('/usr/share/icons');
    return dirs;
}

/**
 * Find a theme that actually ships recolorable folder icons. The active theme
 * wins if it has them; otherwise Adwaita, which is where they come from for the
 * many themes that inherit it.
 */
export function findFolderSource(themeNames) {
    for (const theme of themeNames) {
        if (!theme)
            continue;
        for (const root of systemIconDirs()) {
            const base = GLib.build_filenamev([root, theme]);
            const probe = GLib.build_filenamev([base, 'scalable', 'places', 'folder.svg']);
            const svg = readText(probe);
            if (!svg)
                continue;

            const palette = [...new Set(svg.match(HEX_RE) ?? [])].map(c => c.toLowerCase());
            if (palette.length >= MIN_PALETTE_MATCHES)
                return {theme, base, palette};
        }
    }
    return null;
}

/** Whether a non-Adwaita theme supplies its own scalable folder artwork. */
function themeHasOwnFolders(theme) {
    if (!theme || theme === 'Adwaita')
        return false;

    for (const root of systemIconDirs()) {
        const probe = GLib.build_filenamev(
            [root, theme, 'scalable', 'places', 'folder.svg']);
        if (readText(probe))
            return true;
    }
    return false;
}

/**
 * Map the base palette onto a new accent as an OKLCh delta: hue and chroma move
 * to the target, lightness shifts by the same amount the accent did. Keeping
 * each color's lightness *relationship* intact is what preserves the folder's
 * shading - the lighter front face stays lighter than the back.
 */
function buildColorMap(palette, accentHex) {
    const ref = hexToOklch(REFERENCE_ACCENT);
    const target = hexToOklch(accentHex);
    if (!ref || !target)
        return null;

    const deltaL = target.L - ref.L;
    const deltaH = target.H - ref.H;
    // A near-gray accent must not be scaled up by a huge ratio, and a gray
    // reference would divide by ~zero, so guard the ratio.
    const chromaRatio = ref.C > 0.001 ? target.C / ref.C : 1;

    const map = new Map();
    for (const hex of palette) {
        const c = hexToOklch(hex);
        if (!c)
            continue;
        map.set(hex, oklchToHex({
            L: c.L + deltaL,
            C: c.C * chromaRatio,
            H: (c.H + deltaH + 360) % 360,
        }));
    }
    return map;
}

function countPaletteMatches(svg, palette) {
    const used = new Set((svg.match(HEX_RE) ?? []).map(c => c.toLowerCase()));
    return palette.filter(c => used.has(c)).length;
}

function recolor(svg, map) {
    return svg.replace(HEX_RE, m => map.get(m.toLowerCase()) ?? m);
}

function listChildren(dir, wantDirs) {
    const out = [];
    let children;
    try {
        children = Gio.File.new_for_path(dir).enumerate_children(
            'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
    } catch {
        return out;
    }

    let info;
    while ((info = children.next_file(null)) !== null) {
        const isDir = info.get_file_type() === Gio.FileType.DIRECTORY;
        if (isDir === wantDirs && (wantDirs || info.get_name().endsWith('.svg')))
            out.push(info.get_name());
    }
    children.close(null);
    return out;
}

const listContexts = base => listChildren(GLib.build_filenamev([base, 'scalable']), true);
const listSvgs = dir => listChildren(dir, false);

function loadManifest() {
    const text = readText(MANIFEST());
    return new Set(text ? text.split('\n').filter(l => l.trim()) : []);
}

/**
 * @param {string} accentHex
 * @param {string} activeTheme - the current org.gnome.desktop.interface icon-theme
 * @returns {number} how many icons were written
 */
export function applyFolders(accentHex, activeTheme) {
    // Third-party themes are not necessarily based on Adwaita's blue reference
    // palette. Recoloring their full folder.svg palette could also select
    // unrelated icons which reuse three common colors, so leave them alone.
    if (themeHasOwnFolders(activeTheme)) {
        clearFolders();
        return 0;
    }

    const source = findFolderSource(['Adwaita']);
    if (!source) {
        clearFolders();
        return 0;
    }

    const map = buildColorMap(source.palette, accentHex);
    if (!map) {
        clearFolders();
        return 0;
    }

    const shadowRoot = GLib.build_filenamev(
        [GLib.get_user_data_dir(), 'icons', source.theme]);

    const previous = loadManifest();
    const written = [];

    for (const context of listContexts(source.base)) {
        const srcDir = GLib.build_filenamev([source.base, 'scalable', context]);

        for (const name of listSvgs(srcDir)) {
            const svg = readText(GLib.build_filenamev([srcDir, name]));
            if (!svg || countPaletteMatches(svg, source.palette) < MIN_PALETTE_MATCHES)
                continue;

            const recolored = recolor(svg, map);

            for (const sizeDir of SIZE_DIRS) {
                const target = GLib.build_filenamev([shadowRoot, sizeDir, context, name]);

                // Never clobber an override the user put there themselves.
                if (!previous.has(target) && GLib.file_test(target, GLib.FileTest.EXISTS))
                    continue;

                if (writeText(target, recolored))
                    written.push(target);
            }
        }
    }

    // Anything we wrote last time but not this time is now stale.
    for (const stale of previous) {
        if (!written.includes(stale))
            deleteFile(stale);
    }

    writeText(MANIFEST(), written.join('\n'));
    return written.length;
}

function deleteFile(path) {
    try {
        Gio.File.new_for_path(path).delete(null);
        return true;
    } catch {
        return false;
    }
}

/** Prune directories we emptied, stopping at anything still in use. */
function pruneEmptyDirs(paths) {
    const dirs = new Set();
    for (const p of paths) {
        let d = GLib.path_get_dirname(p);
        // walk up: <theme>/<size>/<context> -> <theme>/<size> -> <theme>
        for (let i = 0; i < 3; i++) {
            dirs.add(d);
            d = GLib.path_get_dirname(d);
        }
    }

    // Deepest first, so a parent is only considered once its children are gone.
    for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
        try {
            Gio.File.new_for_path(dir).delete(null);
        } catch {
            // Not empty, or not ours - stop caring.
        }
    }
}

/** Remove every icon we generated, leaving the stock theme showing through. */
export function clearFolders() {
    const manifest = loadManifest();
    if (!manifest.size)
        return;

    for (const path of manifest)
        deleteFile(path);

    pruneEmptyDirs([...manifest]);
    deleteFile(MANIFEST());
}
