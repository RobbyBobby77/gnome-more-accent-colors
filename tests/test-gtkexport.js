// GTK config writing. These touch the filesystem, so run.sh points XDG_CONFIG_HOME
// at a throwaway directory first - the suite refuses to run without it.

import GLib from 'gi://GLib';

import {ok, eq, section, finish} from './harness.js';
import {applyGtk, clearGtk} from '../more-accent-colors@robbybobby.local/lib/gtkexport.js';

if (!GLib.get_user_config_dir().includes('mac-test-sandbox')) {
    printerr('refusing to run outside the sandbox; use tests/run.sh');
    imports.system.exit(1);
}

const p = name => GLib.build_filenamev([GLib.get_user_config_dir(), 'gtk-4.0', name]);
const read = path => {
    try {
        const [okRead, bytes] = GLib.file_get_contents(path);
        return okRead ? new TextDecoder().decode(bytes) : null;
    } catch {
        return null;
    }
};

section('generated file contents');
applyGtk('gtk4', '#4f46e5', false);
{
    const css = read(p('more-accent-colors.css'));
    ok('file is written', css !== null);
    ok('sets accent_bg_color', css.includes('@define-color accent_bg_color #4f46e5;'));
    ok('sets accent_fg_color', css.includes('@define-color accent_fg_color #ffffff;'));
    ok('sets the modern custom properties', css.includes('--accent-bg-color: #4f46e5;'));
    ok('light mode clamps lightness down', css.includes('min(l, 0.5)'));
}
applyGtk('gtk4', '#4f46e5', true);
ok('dark mode clamps lightness up', read(p('more-accent-colors.css')).includes('max(l, 0.85)'));

applyGtk('gtk4', '#e59500', false);
ok('a bright accent gets dark foreground',
    read(p('more-accent-colors.css')).includes('rgba(0, 0, 0, 0.85)'));

section('gtk.css import line');
ok('@import is the first line (GTK requires it before rules)',
    read(p('gtk.css')).startsWith('@import url("more-accent-colors.css");'));
applyGtk('gtk4', '#4f46e5', false);
applyGtk('gtk4', '#4f46e5', false);
eq('re-applying does not duplicate the import',
    (read(p('gtk.css')).match(/@import/g) ?? []).length, 1);

section('user content is preserved');
GLib.file_set_contents(p('gtk.css'), 'headerbar { min-height: 20px; }\n');
applyGtk('gtk4', '#4f46e5', false);
{
    const after = read(p('gtk.css'));
    ok('existing rule survives apply', after.includes('headerbar { min-height: 20px; }'));
    ok('import still placed first', after.startsWith('@import'));
}
clearGtk('gtk4');
{
    const after = read(p('gtk.css'));
    ok('existing rule survives clear', after.includes('headerbar { min-height: 20px; }'));
    ok('our import line is gone', !after.includes('more-accent-colors'));
    ok('our generated file is deleted', read(p('more-accent-colors.css')) === null);
}

section('cleanup');
GLib.unlink(p('gtk.css'));
applyGtk('gtk4', '#4f46e5', false);
clearGtk('gtk4');
ok('a gtk.css we created ourselves is removed entirely', read(p('gtk.css')) === null);

GLib.file_set_contents(p('gtk.css'), 'button { color: red; }\n');
clearGtk('gtk4');
eq('a gtk.css we never touched is left exactly alone',
    read(p('gtk.css')), 'button { color: red; }\n');
GLib.unlink(p('gtk.css'));

section('gtk3 uses legacy color names');
applyGtk('gtk3', '#4f46e5', false);
{
    const css = read(GLib.build_filenamev(
        [GLib.get_user_config_dir(), 'gtk-3.0', 'more-accent-colors.css']));
    ok('sets theme_selected_bg_color',
        css.includes('@define-color theme_selected_bg_color #4f46e5;'));
    ok('avoids oklab(), which GTK3 cannot parse', !css.includes('oklab'));
}
clearGtk('gtk3');

finish('gtkexport');
