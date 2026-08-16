import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {buildShellStylesheet} from './lib/cssgen.js';
import {resolveSelection, foregroundFor} from './lib/colors.js';
import {applyGtk, clearGtk} from './lib/gtkexport.js';
import {applyFolders, clearFolders} from './lib/folders.js';

const CACHE_SUBDIR = 'more-accent-colors';
const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';

export default class MoreAccentColorsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._stSettings = St.Settings.get();
        this._themeContext = St.ThemeContext.get_for_stage(global.stage);

        this._interfaceSettings = new Gio.Settings({schema_id: INTERFACE_SCHEMA});

        this._loadedFile = null;
        this._loadedTheme = null;
        this._shellSignature = null;
        this._gtkSignature = null;
        this._folderSignature = null;
        this._foldersApplied = false;
        this._generation = 0;
        this._gtkApplied = new Set();

        // Set while we are mutating the theme ourselves. load_stylesheet() makes
        // StTheme emit custom-stylesheets-changed, which StThemeContext turns
        // back into ::changed - so without this the handler below would call
        // straight back into us forever.
        this._applying = false;

        this._settingsChangedId = this._settings.connect('changed', () => this._apply());

        // The Shell swaps its default stylesheet for these, taking our
        // overrides with it.
        this._colorSchemeId = this._stSettings.connect('notify::color-scheme',
            () => this._apply());
        this._contrastId = this._stSettings.connect('notify::high-contrast',
            () => this._apply());

        // StThemeContext has no "theme" property to watch; ::changed is how it
        // reports the StTheme being replaced (a user theme loading, say).
        this._themeChangedId = this._themeContext.connect('changed', () => {
            if (!this._applying)
                this._apply();
        });

        // Switching icon theme changes which icons we have to shadow.
        this._iconThemeId = this._interfaceSettings.connect('changed::icon-theme',
            () => this._apply());

        this._apply();
    }

    disable() {
        for (const [obj, id] of [
            [this._settings, this._settingsChangedId],
            [this._stSettings, this._colorSchemeId],
            [this._stSettings, this._contrastId],
            [this._themeContext, this._themeChangedId],
            [this._interfaceSettings, this._iconThemeId],
        ]) {
            if (obj && id)
                obj.disconnect(id);
        }

        this._unloadShellStylesheet();

        for (const variant of this._gtkApplied)
            clearGtk(variant);
        this._gtkApplied.clear();

        if (this._foldersApplied)
            clearFolders();
        this._foldersApplied = false;

        // After clearFolders, which keeps its manifest in the same directory.
        this._cleanCache();

        this._settings = null;
        this._stSettings = null;
        this._themeContext = null;
        this._interfaceSettings = null;
        this._loadedTheme = null;
        this._shellSignature = null;
        this._gtkSignature = null;
        this._folderSignature = null;
    }

    _apply() {
        const hex = resolveSelection(
            this._settings.get_string('accent-color'),
            this._settings.get_string('custom-color'));

        if (!hex) {
            // "System" - hand control back to GNOME entirely.
            this._unloadShellStylesheet();
            this._syncGtk(null);
            this._syncFolders(null);
            return;
        }

        if (this._settings.get_boolean('apply-to-shell'))
            this._applyShell(hex);
        else
            this._unloadShellStylesheet();

        this._syncGtk(hex);
        this._syncFolders(hex);
    }

    _syncFolders(hex) {
        const iconTheme = this._interfaceSettings.get_string('icon-theme');
        const wanted = hex && this._settings.get_boolean('apply-to-folders');

        const signature = wanted ? `${hex}|${iconTheme}` : 'off';
        if (signature === this._folderSignature)
            return;

        if (wanted) {
            const written = applyFolders(hex, iconTheme);
            this._foldersApplied = written > 0;
            if (!written) {
                console.warn(`${this.metadata.name}: no recolorable folder icons found ` +
                    `for icon theme "${iconTheme}"`);
            }
        } else if (this._foldersApplied) {
            clearFolders();
            this._foldersApplied = false;
        }

        this._folderSignature = signature;
    }

    _applyShell(hex) {
        const theme = this._themeContext.get_theme();
        if (!theme)
            return;

        const sourceFiles = [theme.get_default_stylesheet(), theme.get_theme_stylesheet()]
            .filter(f => f);
        if (!sourceFiles.length) {
            console.warn(`${this.metadata.name}: the Shell reported no stylesheet to derive from`);
            return;
        }

        const fg = foregroundFor(hex);
        const important = this._settings.get_boolean('force-important');
        const signature = [hex, fg, important, ...sourceFiles.map(f => f.get_uri())].join('|');

        // Nothing that affects the output moved, and our sheet is still loaded
        // into this exact theme object.
        if (this._loadedFile && this._loadedTheme === theme &&
            this._shellSignature === signature)
            return;

        const sources = this._readStylesheets(sourceFiles);
        if (!sources.length) {
            console.warn(`${this.metadata.name}: could not read the Shell stylesheet`);
            return;
        }

        const css = buildShellStylesheet(sources, hex, fg, important);
        if (!css) {
            console.warn(`${this.metadata.name}: no accent rules found in the Shell stylesheet`);
            return;
        }

        // A fresh filename every time, so St can never serve a cached parse.
        const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), CACHE_SUBDIR]);
        GLib.mkdir_with_parents(dir, 0o755);
        const path = GLib.build_filenamev([dir, `shell-${this._generation++}.css`]);

        if (!GLib.file_set_contents(path, css)) {
            console.warn(`${this.metadata.name}: failed to write ${path}`);
            return;
        }

        this._unloadShellStylesheet();

        const file = Gio.File.new_for_path(path);
        this._applying = true;
        try {
            theme.load_stylesheet(file);
        } catch (e) {
            logError(e, `${this.metadata.name}: loading generated stylesheet`);
            this._applying = false;
            try {
                file.delete(null);
            } catch {
                // Best effort.
            }
            return;
        }
        this._applying = false;

        this._loadedFile = file;
        this._loadedTheme = theme;
        this._shellSignature = signature;
    }

    _unloadShellStylesheet() {
        if (!this._loadedFile)
            return;

        // If the theme object itself was replaced, our sheet went with it.
        if (this._loadedTheme && this._themeContext &&
            this._loadedTheme === this._themeContext.get_theme()) {
            this._applying = true;
            try {
                this._loadedTheme.unload_stylesheet(this._loadedFile);
            } catch (e) {
                logError(e, `${this.metadata.name}: unloading stylesheet`);
            }
            this._applying = false;
        }

        try {
            this._loadedFile.delete(null);
        } catch {
            // Already gone.
        }

        this._loadedFile = null;
        this._loadedTheme = null;
        this._shellSignature = null;
    }

    /**
     * Whether the dark scheme is active. St.SystemColorScheme has a "default"
     * value whose light/dark meaning is a Shell policy detail, so we read the
     * decision the Shell already made: which default stylesheet it loaded.
     */
    _isDark() {
        const sheet = this._themeContext.get_theme()?.get_default_stylesheet();
        if (sheet)
            return sheet.get_uri().includes('-dark');
        return this._stSettings.color_scheme === St.SystemColorScheme.PREFER_DARK;
    }

    _syncGtk(hex) {
        const dark = this._isDark();
        const wanted = [];

        for (const [variant, key] of [['gtk4', 'apply-to-gtk4'], ['gtk3', 'apply-to-gtk3']]) {
            if (hex && this._settings.get_boolean(key))
                wanted.push(variant);
        }

        const signature = [hex, dark, ...wanted].join('|');
        if (signature === this._gtkSignature)
            return;

        for (const variant of ['gtk4', 'gtk3']) {
            if (wanted.includes(variant)) {
                applyGtk(variant, hex, dark);
                this._gtkApplied.add(variant);
            } else if (this._gtkApplied.has(variant)) {
                clearGtk(variant);
                this._gtkApplied.delete(variant);
            }
        }

        this._gtkSignature = signature;
    }

    _readStylesheets(files) {
        return files
            .map(f => {
                try {
                    const [ok, bytes] = f.load_contents(null);
                    return ok ? new TextDecoder().decode(bytes) : null;
                } catch (e) {
                    logError(e, `${this.metadata.name}: reading ${f.get_uri()}`);
                    return null;
                }
            })
            .filter(css => css);
    }

    _cleanCache() {
        const dir = Gio.File.new_for_path(
            GLib.build_filenamev([GLib.get_user_cache_dir(), CACHE_SUBDIR]));

        let children;
        try {
            children = dir.enumerate_children('standard::name',
                Gio.FileQueryInfoFlags.NONE, null);
        } catch {
            return;
        }

        let info;
        while ((info = children.next_file(null)) !== null) {
            try {
                dir.get_child(info.get_name()).delete(null);
            } catch {
                // Best effort.
            }
        }
        children.close(null);
    }
}
