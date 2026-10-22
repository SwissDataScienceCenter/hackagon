"""Sphinx configuration for the Hackagon user documentation."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[2]


def git(*args: str) -> str:
    """Run git in the repo, treating any failure as "unknown"."""
    try:
        return subprocess.run(
            ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def build_version() -> str:
    """The version these docs describe, by the same rule as the app's footer.

    Kept in step with `buildVersion()` in components/frontend/vite.config.ts,
    so the docs built from a commit and the app built from it show the same
    string, and a reader can tell whether the two match. A clean checkout on
    the tag matching `VERSION` is a release and gets a bare `v0.11.0`;
    anything else says which commit it is, `v0.11.0+abc1234`.
    """
    declared = (ROOT / "VERSION").read_text().strip()
    if git("rev-parse", "--verify", "HEAD") == "":
        return f"v{declared}"

    commit = git("rev-parse", "--short=7", "HEAD")
    dirty = git("status", "--porcelain") != ""
    on_tag = f"v{declared}" in git("tag", "--points-at", "HEAD").split("\n")

    if on_tag and not dirty:
        return f"v{declared}"
    return f"v{declared}{'+' + commit if commit else ''}{'-dirty' if dirty else ''}"


project = "Hackagon"
author = "Swiss Data Science Center"
copyright = "Swiss Data Science Center"

release = build_version()
version = release

extensions = ["myst_parser"]
source_suffix = {".md": "markdown"}

myst_enable_extensions = [
    # ::: fences for notes and warnings, which keep rendering as plain text in
    # a Markdown preview instead of breaking it. Only for a directive with no
    # options, though: Prettier wraps the docs at 80 columns and joins an
    # option line such as `:class: important` onto the directive's own line,
    # where Sphinx reads it as part of the title. A directive with options goes
    # in a ``` fence, whose contents Prettier leaves alone.
    "colon_fence",
]
# Anchors for headings down to ###, so a page can link to a section of another
# and the app can link straight to one.
myst_heading_anchors = 3

html_theme = "furo"
# Without the version: in the sidebar it wrapped onto three lines, and the
# announcement below already names it on every page.
html_title = "Hackagon documentation"
html_show_sourcelink = False

html_theme_options = {
    # The published site is built from main, which is what the dev instance
    # runs; production runs a release and can lag behind it. Until there is one
    # set of docs per release, say so on every page rather than let a reader
    # look for a feature their hackathon does not have yet.
    "announcement": (
        f"These docs describe the latest development version, {release}. "
        "Your hackathon may run an earlier release."
    ),
}
