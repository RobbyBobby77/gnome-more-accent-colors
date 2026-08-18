// Folder icon recoloring. Reads the real Adwaita icons from the system and
// writes into a sandboxed XDG_DATA_HOME, so nothing here touches real icons.

import GLib from 'gi://GLib';

import {ok, eq, skip, section, finish} from './harness.js';
import {applyFolders, clearFolders, findFolderSource}
    from '../more-accent-colors@robbybobby77.github.io/lib/folders.js';

if (!GLib.get_user_data_dir().includes('mac-test-sandbox')) {
    printerr('refusing to run outside the sandbox; use tests/run.sh');
    imports.system.exit(1);
}

const shadow = rel => GLib.build_filenamev(
    [GLib.get_user_data_dir(), 'icons', 'Adwaita', ...rel.split('/')]);
const exists = rel => GLib.file_test(shadow(rel), GLib.FileTest.EXISTS);
const read = path => {
    try {
        const [okRead, bytes] = GLib.file_get_contents(path);
        return okRead ? new TextDecoder().decode(bytes) : null;
    } catch {
        return null;
    }
};

const source = findFolderSource(['Adwaita']);

if (!source) {
    skip('all folder tests', 'Adwaita folder icons not installed');
    finish('folders');
}

section('source discovery');
eq('finds Adwaita', source.theme, 'Adwaita');
eq('derives the 5-color base palette from folder.svg', source.palette.length, 5);
ok('palette is all lowercase hex', source.palette.every(c => /^#[0-9a-f]{6}$/.test(c)));

section('icon selection');
const written = applyFolders('#e62d42', 'Adwaita');
eq('writes 15 icons across 2 size directories', written, 30);

ok('plain folder', exists('scalable/places/folder.svg'));
ok('inode-directory — what an ordinary directory actually resolves to first',
    exists('scalable/mimetypes/inode-directory.svg'));
ok('folder-open, which lives under status/', exists('scalable/status/folder-open.svg'));
ok('special folders', exists('scalable/places/folder-documents.svg'));
ok('user-home', exists('scalable/places/user-home.svg'));
ok('published at 16x16 too, beating the stock PNG', exists('16x16/places/folder.svg'));
ok('16x16 mimetypes as well', exists('16x16/mimetypes/inode-directory.svg'));

ok('excludes user-trash (green, not a folder palette)',
    !exists('scalable/places/user-trash.svg'));
ok('excludes network-workgroup, which shares exactly one blue',
    !exists('scalable/places/network-workgroup.svg'));

section('recoloring');
{
    const svg = read(shadow('scalable/places/folder.svg'));
    ok('no base-palette color survives',
        !source.palette.some(c => svg.toLowerCase().includes(c)));
    eq('still 5 distinct colors — gamut clipping must not merge shades',
        new Set(svg.match(/#[0-9a-fA-F]{6}/g)).size, 5);
    eq('same number of color occurrences as the source', (svg.match(/#[0-9a-fA-F]{6}/g) ?? []).length, 8);
}
{
    const svg = read(shadow('scalable/places/folder-remote.svg'));
    ok('non-palette greys are left alone (the network glyph)',
        svg.includes('#77767b') && svg.includes('#9a9996'));
}

section('identity invariant');
clearFolders();
applyFolders('#3584e4', 'Adwaita');   // GNOME's own blue, the reference accent
{
    const generated = read(shadow('scalable/places/folder.svg'));
    const stock = read(GLib.build_filenamev(
        [source.base, 'scalable', 'places', 'folder.svg']));
    ok('recoloring to the reference accent reproduces the stock icon byte-for-byte',
        generated === stock);
}

section('every accent stays in gamut');
{
    const bad = [];
    for (const hex of ['#3584e4', '#c88800', '#6f8396', '#4f46e5', '#e59500',
        '#0eaaa0', '#5b5b66', '#ffffff', '#000000']) {
        clearFolders();
        applyFolders(hex, 'Adwaita');
        const svg = read(shadow('scalable/places/folder.svg')) ?? '';
        const colors = svg.match(/#[0-9a-fA-F]{6}/g) ?? [];
        if (colors.length !== 8 || !colors.every(c => /^#[0-9a-f]{6}$/i.test(c)))
            bad.push(hex);
    }
    ok('including pure white and pure black', bad.length === 0,
        `these produced malformed output: ${bad.join(', ')}`);
}

section('unsupported themes');
clearFolders();
{
    const synthetic = GLib.build_filenamev([
        GLib.get_system_data_dirs()[0], 'icons', 'Synthetic',
        'scalable', 'places', 'folder.svg',
    ]);
    GLib.mkdir_with_parents(GLib.path_get_dirname(synthetic), 0o755);
    GLib.file_set_contents(synthetic,
        '<svg><path fill="#112233"/><path fill="#445566"/><path fill="#778899"/></svg>');

    ok('establishes generated Adwaita icons before the theme switch',
        applyFolders('#e62d42', 'Adwaita') > 0);
    eq('a theme with its own folder artwork is left untouched',
        applyFolders('#e62d42', 'Synthetic'), 0);
    ok('the unsupported theme gets no generated overlay',
        !GLib.file_test(GLib.build_filenamev(
            [GLib.get_user_data_dir(), 'icons', 'Synthetic']), GLib.FileTest.EXISTS));
    ok('a failed refresh removes the previous generated icons',
        !exists('scalable/places/folder.svg'));
    ok('and removes their cleanup manifest',
        !GLib.file_test(GLib.build_filenamev([
            GLib.get_user_cache_dir(), 'more-accent-colors', 'folders.manifest',
        ]), GLib.FileTest.EXISTS));
}

section('never clobbers the user');
clearFolders();
{
    const mine = shadow('scalable/places/folder.svg');
    GLib.mkdir_with_parents(GLib.path_get_dirname(mine), 0o755);
    GLib.file_set_contents(mine, '<svg>USER OWN</svg>');

    applyFolders('#e62d42', 'Adwaita');
    eq('a pre-existing icon is not overwritten', read(mine), '<svg>USER OWN</svg>');

    clearFolders();
    eq('and not deleted on cleanup', read(mine), '<svg>USER OWN</svg>');
    GLib.unlink(mine);
}

section('cleanup');
applyFolders('#e62d42', 'Adwaita');
clearFolders();
ok('removes every generated icon',
    !exists('scalable/places/folder.svg') && !exists('scalable/mimetypes/inode-directory.svg'));
ok('prunes the emptied theme directory',
    !GLib.file_test(GLib.build_filenamev([GLib.get_user_data_dir(), 'icons', 'Adwaita']),
        GLib.FileTest.EXISTS));

finish('folders');
