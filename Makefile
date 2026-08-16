UUID = more-accent-colors@robbybobby.local
ZIP  = $(UUID).shell-extension.zip

.PHONY: all pack install uninstall enable disable prefs reload clean

all: pack

pack:
	gnome-extensions pack $(UUID) --extra-source=lib --force -o .

install: pack
	gnome-extensions install --force $(ZIP)
	@echo
	@echo "Installed. If this is the first install, log out and back in,"
	@echo "then: gnome-extensions enable $(UUID)"

uninstall:
	-gnome-extensions disable $(UUID)
	gnome-extensions uninstall $(UUID)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

prefs:
	gnome-extensions prefs $(UUID)

# Pick up code changes without logging out.
reload: install
	-gnome-extensions disable $(UUID)
	gnome-extensions enable $(UUID)

clean:
	rm -f $(ZIP) $(UUID)/schemas/gschemas.compiled
