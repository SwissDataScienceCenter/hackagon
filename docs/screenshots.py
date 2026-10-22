"""Retake the screenshots of hackathon sidebar pages for the user docs.

Only on demand, and only the pages named:

    just docs::screenshots manage-teams member-voting
    just docs::screenshots --all

Each name is a section of screenshots.toml and a doc page under src/. The
picture lands in src/static/screenshots/<name>.png, and the run ends by saying
which pictures changed — the doc pages to reread.

Needs the local stack (`just start`) with seeded data (`just db::seed`): it logs
in through Keycloak as a seeded user, opens the hackathon from the dashboard and
clicks the sidebar entry by its `data-nav-id`, so an entry that is missing
fails loudly instead of photographing the wrong page.
"""

import argparse
import hashlib
import os
import sys
import tomllib
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

DOCS = Path(__file__).parent
MANIFEST = DOCS / "screenshots.toml"
OUT = DOCS / "src" / "static" / "screenshots"

APP = os.environ.get("HACKAGON_URL", "http://localhost:8081").rstrip("/")
# The dev password every seeded login shares (see CLAUDE.md).
PASSWORD = os.environ.get("HACKAGON_PASSWORD", "aliceandbob")

# A typical laptop, at double density so text stays sharp on a retina screen.
# Only the first screen of a page: a roster of a hundred people photographed
# whole is a picture nobody reads.
VIEWPORT = {"width": 1440, "height": 900}
SCALE = 2


class ShotError(Exception):
    pass


def digest(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def log_in(page: Page, user: str) -> None:
    # Settled first: "Log in" is a client-side handler, and a click that lands
    # before the page has hydrated does nothing.
    page.goto(f"{APP}/", wait_until="networkidle")
    page.get_by_role("button", name="Log in").click()
    page.locator("#username").fill(user)
    # Keycloak shows the password on the same form or, with a username-first
    # flow, on the next one.
    if not page.locator("#password").is_visible():
        page.locator("#kc-login").click()
    page.locator("#password").fill(PASSWORD)
    page.locator("#kc-login").click()
    page.wait_for_url(f"{APP}/**")
    if page.get_by_role("button", name="Log in").is_visible():
        raise ShotError(f"could not log in as {user}")


def open_page(page: Page, name: str, shot: dict) -> None:
    page.goto(f"{APP}/dashboard")
    page.wait_for_load_state("networkidle")
    # A dashboard row is a link named after its hackathon (aria-label).
    hackathon = page.get_by_role("link", name=shot["hackathon"], exact=True)
    if hackathon.count() == 0:
        raise ShotError(
            f"{shot['user']} has no '{shot['hackathon']}' on the dashboard. "
            "Seeded data missing? Try `just db::seed`."
        )
    hackathon.first.click()
    page.wait_for_url("**/my/hackathon/**")

    page.wait_for_load_state("networkidle")
    if page.locator("[data-nav-id]").count() == 0:
        raise ShotError(
            f"the sidebar at {APP} has no data-nav-id at all: the running app is "
            "older than this script. Is the stack running from this checkout?"
        )
    entry = page.locator(f'[data-nav-id="{shot["nav"]}"]:visible')
    if entry.count() == 0:
        raise ShotError(
            f"{shot['nav']} is not in {shot['user']}'s sidebar in "
            f"'{shot['hackathon']}'. Is the capability on, or are there teams, "
            f"phases or tracks there? Pick another hackathon for [{name}]."
        )
    # SvelteKit navigates client-side: the click starts no page load, so waiting
    # for one returns at once and photographs the page we came from. Wait for
    # the address the entry points at instead — or one below it, since some
    # entries redirect on (Manage Forms opens its first form).
    href = entry.first.get_attribute("href") or ""
    entry.first.click()
    page.wait_for_url(lambda url: href in url)
    page.wait_for_load_state("networkidle")
    # Off the page, so no hover state ends up in the picture.
    page.mouse.move(VIEWPORT["width"] - 1, VIEWPORT["height"] - 1)


def main() -> int:
    manifest = tomllib.loads(MANIFEST.read_text())

    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("pages", nargs="*", help="pages to retake")
    parser.add_argument("--all", action="store_true", help="retake every page")
    args = parser.parse_args()

    names = list(manifest) if args.all else args.pages
    if not names:
        parser.error(f"name the pages to retake, or --all. Pages: {' '.join(manifest)}")
    unknown = [n for n in names if n not in manifest]
    if unknown:
        parser.error(f"unknown {', '.join(unknown)}. Pages: {' '.join(manifest)}")

    OUT.mkdir(parents=True, exist_ok=True)
    changed, unchanged, failed = [], [], []

    # One login per user, then every page of theirs.
    by_user: dict[str, list[str]] = {}
    for name in names:
        by_user.setdefault(manifest[name]["user"], []).append(name)

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for user, pages in by_user.items():
            context = browser.new_context(viewport=VIEWPORT, device_scale_factor=SCALE)
            # The docs are light by default; the app follows the stored mode.
            context.add_init_script("localStorage.setItem('mode', 'light')")
            page = context.new_page()
            try:
                log_in(page, user)
            except Exception as err:  # noqa: BLE001 — reported per page below
                failed += [(n, str(err)) for n in pages]
                context.close()
                continue

            for name in pages:
                path = OUT / f"{name}.png"
                before = digest(path)
                try:
                    open_page(page, name, manifest[name])
                    page.screenshot(path=path, animations="disabled")
                except Exception as err:  # noqa: BLE001 — one bad page, not the run
                    failed.append((name, str(err).splitlines()[0]))
                    continue
                (unchanged if digest(path) == before else changed).append(name)
            context.close()
        browser.close()

    for name in changed:
        print(f"changed    {name}  → reread src/*/{name}.md")
    for name in unchanged:
        print(f"unchanged  {name}")
    for name, err in failed:
        print(f"FAILED     {name}: {err}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
