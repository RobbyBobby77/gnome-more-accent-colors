import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {SYSTEM_COLORS, EXTRA_COLORS, parseHex, toHex} from './lib/colors.js';

const SWATCH_SIZE = 42;

/** Fallback when the override switch is turned on while set to "system". */
const DEFAULT_PICK = 'indigo';

const Swatch = GObject.registerClass(
class Swatch extends Gtk.ToggleButton {
    _init(id, name) {
        super._init({
            tooltip_text: name,
            width_request: SWATCH_SIZE,
            height_request: SWATCH_SIZE,
            has_frame: false,
            css_classes: ['mac-swatch', `mac-swatch-${id}`],
        });

        this.colorId = id;

        this._check = new Gtk.Image({
            icon_name: 'object-select-symbolic',
            pixel_size: 18,
            opacity: 0,
        });
        this.set_child(this._check);

        this.connect('notify::active', () => {
            this._check.opacity = this.active ? 1 : 0;
        });
    }
});

export default class MoreAccentColorsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        this._installSwatchStyles();

        const page = new Adw.PreferencesPage({
            title: 'Colors',
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(page);

        const swatches = [];
        let updating = false;

        /** Light up exactly one swatch (or none) without re-entering the handlers. */
        const select = id => {
            updating = true;
            for (const s of swatches)
                s.active = s.colorId === id;
            updating = false;
        };

        // -- Override switch --------------------------------------------------
        const overrideGroup = new Adw.PreferencesGroup({title: 'Accent color'});
        const overrideRow = new Adw.SwitchRow({
            title: 'Override the system accent color',
            subtitle: 'Turn off to hand control back to GNOME Settings',
            active: settings.get_string('accent-color') !== 'system',
        });
        overrideGroup.add(overrideRow);
        page.add(overrideGroup);

        // Remembered so toggling off and back on restores the previous pick.
        let lastPick = settings.get_string('accent-color');
        if (lastPick === 'system')
            lastPick = DEFAULT_PICK;

        // -- Palettes ---------------------------------------------------------
        const makePaletteGroup = (title, description, colors) => {
            const group = new Adw.PreferencesGroup({title, description});
            const flow = new Gtk.FlowBox({
                selection_mode: Gtk.SelectionMode.NONE,
                homogeneous: true,
                row_spacing: 8,
                column_spacing: 8,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 8,
                margin_end: 8,
                max_children_per_line: 9,
            });

            for (const {id, name} of colors) {
                const swatch = new Swatch(id, name);
                swatch.connect('clicked', () => {
                    if (updating)
                        return;
                    // GtkButton toggles before this runs; clicking the current
                    // swatch would otherwise deselect everything.
                    if (!swatch.active) {
                        swatch.active = true;
                        return;
                    }
                    select(id);
                    lastPick = id;
                    settings.set_string('accent-color', id);
                });
                swatches.push(swatch);
                flow.append(swatch);
            }

            group.add(new Adw.PreferencesRow({activatable: false, child: flow}));
            page.add(group);
            return group;
        };

        const systemGroup = makePaletteGroup(
            'System palette', 'The nine colors GNOME already offers.', SYSTEM_COLORS);
        const extraGroup = makePaletteGroup(
            'Added by this extension', null, EXTRA_COLORS);

        // -- Custom color -----------------------------------------------------
        const customGroup = new Adw.PreferencesGroup({title: 'Custom'});
        const colorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: false}),
            valign: Gtk.Align.CENTER,
        });

        const initial = new Gdk.RGBA();
        if (initial.parse(settings.get_string('custom-color')))
            colorButton.rgba = initial;

        const customRow = new Adw.ActionRow({
            title: 'Custom color',
            subtitle: 'Pick any color',
            activatable_widget: colorButton,
        });
        customRow.add_suffix(colorButton);
        customGroup.add(customRow);
        page.add(customGroup);

        colorButton.connect('notify::rgba', () => {
            if (updating)
                return;
            const c = colorButton.rgba;
            settings.set_string('custom-color',
                toHex({r: c.red * 255, g: c.green * 255, b: c.blue * 255}));
            select(null);
            lastPick = 'custom';
            settings.set_string('accent-color', 'custom');
        });

        // -- Sensitivity ------------------------------------------------------
        const paletteGroups = [systemGroup, extraGroup, customGroup];
        const syncSensitivity = () => {
            for (const g of paletteGroups)
                g.sensitive = overrideRow.active;
        };

        overrideRow.connect('notify::active', () => {
            syncSensitivity();
            if (overrideRow.active) {
                settings.set_string('accent-color', lastPick);
                select(lastPick);
            } else {
                settings.set_string('accent-color', 'system');
                select(null);
            }
        });

        syncSensitivity();
        select(settings.get_string('accent-color'));

        // -- Targets ----------------------------------------------------------
        const targets = new Adw.PreferencesGroup({
            title: 'Apply to',
            description: 'GTK apps pick up changes live; a few need a restart.',
        });
        page.add(targets);

        for (const [key, title, subtitle] of [
            ['apply-to-shell', 'GNOME Shell', 'Panel, overview, quick settings, dialogs'],
            ['apply-to-gtk4', 'GTK4 and libadwaita apps', 'Writes ~/.config/gtk-4.0/gtk.css'],
            ['apply-to-gtk3', 'GTK3 apps', 'Writes ~/.config/gtk-3.0/gtk.css'],
            ['apply-to-folders', 'Folder icons',
                'Tinted copies in ~/.local/share/icons, shadowing the icon theme'],
        ]) {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            targets.add(row);
        }

        // -- Advanced ---------------------------------------------------------
        const reach = new Adw.PreferencesGroup({
            title: 'Other apps',
            description: 'Some apps never read the stylesheet, so they need help.',
        });
        page.add(reach);

        const syncRow = new Adw.SwitchRow({
            title: 'Match the closest system accent',
            subtitle: 'Apps that read the accent directly — and Flatpak apps, which ' +
                "can't see this extension's CSS — only ever get one of GNOME's nine. " +
                'This points that setting at the nearest match, and restores it on disable.',
        });
        settings.bind('sync-system-accent', syncRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        reach.add(syncRow);

        const flatpakRow = new Adw.ActionRow({
            title: 'Flatpak apps need one-time permission',
            subtitle: 'flatpak override --user --filesystem=xdg-config/gtk-4.0:ro',
        });
        const copyButton = new Gtk.Button({
            icon_name: 'edit-copy-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Copy command',
            css_classes: ['flat'],
        });
        copyButton.connect('clicked', () => {
            Gdk.Display.get_default()?.get_clipboard()
                .set('flatpak override --user --filesystem=xdg-config/gtk-4.0:ro');
            copyButton.icon_name = 'object-select-symbolic';
        });
        flatpakRow.add_suffix(copyButton);
        flatpakRow.activatable_widget = copyButton;
        reach.add(flatpakRow);

        const advanced = new Adw.PreferencesGroup({title: 'Advanced'});
        const importantRow = new Adw.SwitchRow({
            title: 'Force override',
            subtitle: 'Marks generated Shell rules !important. Turn this off only ' +
                'if it conflicts with another theming extension.',
        });
        settings.bind('force-important', importantRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        advanced.add(importantRow);
        page.add(advanced);
    }

    /** One provider carrying the background color for every swatch. */
    _installSwatchStyles() {
        const rules = [`
            .mac-swatch {
                border-radius: 999px;
                padding: 0;
                min-width: ${SWATCH_SIZE}px;
                min-height: ${SWATCH_SIZE}px;
                background-image: none;
                box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
            }`];

        for (const {id, hex} of [...SYSTEM_COLORS, ...EXTRA_COLORS]) {
            const rgb = parseHex(hex);
            const light = rgb && (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 150;
            rules.push(`
            .mac-swatch-${id} {
                background-color: ${hex};
                color: ${light ? 'rgba(0, 0, 0, 0.85)' : '#ffffff'};
            }`);
        }

        const provider = new Gtk.CssProvider();
        provider.load_from_string(rules.join('\n'));
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }
}
