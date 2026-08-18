// Stylesheet extraction. The synthetic cases pin the parser's behaviour; the
// last section runs it against the Shell stylesheet actually installed on this
// machine, which is the input that matters in practice.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ok, eq, skip, section, finish} from './harness.js';
import {buildShellStylesheet} from '../more-accent-colors@robbybobby77.github.io/lib/cssgen.js';

const build = (css, important = false) =>
    buildShellStylesheet([css], '#ff0000', '#00ff00', important);

section('declaration filtering');
{
    const out = build('.a { color: -st-accent-color; background: blue; }');
    ok('keeps the accent declaration', out.includes('color: #ff0000'));
    ok('drops the non-accent declaration in the same rule', !out.includes('background: blue'));
}
{
    const out = build('.keep { color: -st-accent-color; }\n.drop { color: blue; }');
    ok('keeps rules that use the accent', out.includes('.keep'));
    ok('drops rules that do not', !out.includes('.drop'));
}
eq('empty input yields empty output', build('.a { color: blue; }'), '');

section('keyword substitution');
{
    const out = build('.a { color: -st-accent-fg-color; background: -st-accent-color; }');
    ok('accent keyword replaced', out.includes('#ff0000'));
    ok('accent-fg keyword replaced', out.includes('#00ff00'));
    ok('no keyword survives', !out.includes('-st-accent-'));
}
{
    // The whole point: St's color functions must be handed through untouched.
    const out = build('.a { background: st-mix(-st-accent-color, st-darken(#fafafb, 7%), 5%); }');
    ok('nested color functions preserved',
        out.includes('st-mix(#ff0000, st-darken(#fafafb, 7%), 5%)'));
}

section('!important handling');
{
    const out = build('.a { color: -st-accent-color; }', true);
    ok('adds !important when forced', out.includes('!important'));
    eq('adds it exactly once', (out.match(/!important/g) ?? []).length, 1);
}
{
    const out = build('.a { color: -st-accent-color !important; }', true);
    eq('does not double up on existing !important',
        (out.match(/!important/g) ?? []).length, 1);
}
{
    const out = build('.a { color: -st-accent-color; }', false);
    ok('omits !important when not forced', !out.includes('!important'));
}

section('at-rules and structure');
{
    const out = build('@media (min-width: 100px) { .a { color: -st-accent-color; } }');
    ok('@media wrapper preserved', out.includes('@media (min-width: 100px)'));
    ok('inner rule preserved', out.includes('.a'));
}
{
    const out = build('@media (foo) { .a { color: blue; } }');
    ok('at-rule with no accent inside is dropped', !out.includes('@media'));
}
{
    const out = build('/* c */ .a { color: -st-accent-color; /* trailing */ }');
    ok('comments stripped', !out.includes('/* c */') && !out.includes('trailing'));
}
{
    const out = build('.a,\n.b:hover { color: -st-accent-color; }');
    ok('multi-line selectors kept intact', out.includes('.a') && out.includes('.b:hover'));
}
{
    const css = '.first { color: -st-accent-color; }\n.second { color: -st-accent-color; }';
    const out = build(css);
    ok('source order preserved (cascade depends on it)',
        out.indexOf('.first') < out.indexOf('.second'));
}

section('multiple sources');
{
    const out = buildShellStylesheet(
        ['.a { color: -st-accent-color; }', '.b { color: -st-accent-color; }'],
        '#ff0000', '#00ff00', false);
    ok('both sources contribute', out.includes('.a') && out.includes('.b'));
    ok('later source cascades last', out.indexOf('.a') < out.indexOf('.b'));
}
eq('no sources yields empty', buildShellStylesheet([], '#ff0000', '#00ff00', false), '');
eq('null sources tolerated', buildShellStylesheet([null], '#ff0000', '#00ff00', false), '');

section('against the installed GNOME Shell stylesheet');
{
    const theme = '/usr/share/gnome-shell/gnome-shell-theme.gresource';
    if (!GLib.file_test(theme, GLib.FileTest.EXISTS)) {
        skip('real stylesheet extraction', 'gnome-shell theme resource not installed');
    } else {
        Gio.Resource.load(theme)._register();
        let checked = 0;
        for (const name of ['gnome-shell-light', 'gnome-shell-dark', 'gnome-shell-high-contrast']) {
            const uri = `resource:///org/gnome/shell/theme/${name}.css`;
            let css;
            try {
                const [, bytes] = Gio.File.new_for_uri(uri).load_contents(null);
                css = new TextDecoder().decode(bytes);
            } catch {
                continue;
            }
            checked++;
            const out = buildShellStylesheet([css], '#ff0000', '#00ff00', true);
            const opens = (out.match(/{/g) ?? []).length;
            const closes = (out.match(/}/g) ?? []).length;

            ok(`${name}: produces output`, out.length > 0);
            ok(`${name}: braces balanced`, opens === closes, `${opens} open vs ${closes} close`);
            ok(`${name}: no keyword left unresolved`, !out.includes('-st-accent-'));
            ok(`${name}: smaller than the source`, out.length < css.length);
        }
        ok('at least one shipped stylesheet was checked', checked > 0);
    }
}

finish('cssgen');
