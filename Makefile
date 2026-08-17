UUID = more-accent-colors@robbybobby.local
ZIP  = $(UUID).shell-extension.zip

.PHONY: all test pack install uninstall enable disable prefs reload clean

all: pack

# Runs against a throwaway XDG root; never touches your real config.
test:
	@./tests/run.sh

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

# Re-runs enable() on the code already loaded in the Shell. Useful to re-apply
# state, but it does NOT pick up edited files: GNOME caches extension code as an
# ES module for the life of the Shell process. Log out and back in for that.
reload:
	-gnome-extensions disable $(UUID)
	gnome-extensions enable $(UUID)

clean:
	rm -f $(ZIP) $(UUID)/schemas/gschemas.compiled
