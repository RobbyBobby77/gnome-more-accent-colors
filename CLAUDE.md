# CLAUDE.md

**Read `HANDOFF.md` in the project root before doing anything here.** It carries
the verified findings, the mistakes already made, and current live state. It is
deliberately untracked and local-only, so it will not be in a fresh clone.

A GNOME Shell 50 extension adding accent colors beyond GNOME's nine. Recolors the
Shell, GTK/libadwaita apps, and folder icons.

## Traps that have already cost time

1. **`disable`/`enable` does NOT reload extension code.** GJS caches ES modules
   for the life of the Shell process, and Wayland can't restart it in place — so
   code changes need a **logout/login**. Before debugging "my fix didn't work",
   compare `ps -o lstart= -C gnome-shell` against the installed file mtimes.
   To prove whether code reloaded, use a **filesystem marker**, not a log line.

2. **The Bash tool runs zsh.** Unquoted scalars are not word-split (`for c in
   $LIST` iterates once with the whole string), and `[]`/`?` glob-expand — quote
   `gh api` arguments. Write loops in Python instead.

3. **Read the binary, not your memory.** libadwaita's real accent rules came from
   `strings` on `libadwaita-1.so.0`; St's real API came from the typelib. Every
   time reasoning was preferred over inspection here, it was wrong.

4. **`St.ThemeContext` has no `theme` property** — use its `changed` signal. And
   `load_stylesheet()` re-enters that signal, so reentrancy guards are load-bearing.

## Commands

```sh
make test      # 125 assertions, sandboxed under a temp XDG root
make install   # then LOG OUT to actually load the code
make prefs
```

`lib/colors.js` is imported by both `extension.js` and `prefs.js` — keep it free
of Shell-only and Gtk-only imports.
