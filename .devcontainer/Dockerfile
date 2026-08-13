ARG BASE_IMAGE=mcr.microsoft.com/devcontainers/base:ubuntu-24.04
FROM ${BASE_IMAGE}

# System libraries Playwright's Firefox links against. `playwright install
# --with-deps` apt-installs these at runtime, but that writes to the
# container's writable layer, so they vanish the moment the container is
# recreated (e.g. any docker-compose change) and the e2e suite then dies with
# "libgtk-3.so.0: cannot open shared object file". Baking them into the image
# makes the browser survive recreation.
# Kept in sync with `playwright install --with-deps firefox` on Ubuntu 24.04.
# To re-derive this list after a Playwright bump: run `playwright install
# --with-deps firefox` in a container, then diff `apt-mark showmanual` against
# the same command run in a fresh container of this image. Anything the diff
# names is living in the writable layer and dies at the next recreate.
ARG INSTALL_BROWSER_DEPS=1
RUN if [ "${INSTALL_BROWSER_DEPS}" = "1" ]; then \
        apt-get update \
        && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
            libgtk-3-0t64 \
            libasound2t64 \
            libdbus-glib-1-2 \
            libx11-xcb1 \
            libxcb-shm0 \
            libxcomposite1 \
            libxcursor1 \
            libxdamage1 \
            libxfixes3 \
            libxi6 \
            libxrandr2 \
            libxtst6 \
            libpangocairo-1.0-0 \
            libcairo-gobject2 \
            libatk1.0-0t64 \
            libatk-bridge2.0-0t64 \
            libepoxy0 \
            libnss3 \
            libnspr4 \
            fonts-liberation \
            libcairo2 \
            libdbus-1-3 \
            libfontconfig1 \
            libfreetype6 \
            libgdk-pixbuf-2.0-0 \
            libglib2.0-0t64 \
            libpango-1.0-0 \
            libx11-6 \
            libxcb1 \
            libxext6 \
            libxrender1 \
            libavcodec60 \
            xvfb \
            xfonts-cyrillic \
            xfonts-scalable \
            fonts-freefont-ttf \
            fonts-ipafont-gothic \
            fonts-noto-color-emoji \
            fonts-tlwg-loma-otf \
            fonts-unifont \
            fonts-wqy-zenhei \
        && rm -rf /var/lib/apt/lists/*; \
    fi

# git-lfs. Three files in this repo are stored in LFS
# (components/frontend/static/favicon.png, static/og-default.jpg and
# tools/configs/keycloak/themes/hackagon/login/resources/img/favicon.ico).
# The workspace is bind-mounted from the host, which HAS git-lfs, so those
# files hold their real bytes in the worktree while HEAD holds the pointer.
# Without the lfs filters installed here, git inside the container compares
# pointer against content and reports all three modified — the worktree is
# dirty with zero edits, `git status` stops being a usable signal, and every
# `nix develop` evaluates a flake it must mark dirty.
#
# `--system` writes /etc/gitconfig on purpose: /home/vscode is a named volume,
# so anything this image writes to the user's home is masked at runtime.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git-lfs \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install --system --skip-repo

# Space-separated list of extra apt packages to bake into the image
# (set HACKAGON_DEV_EXTRA_APT_PACKAGES in .devcontainer/.env).
ARG EXTRA_APT_PACKAGES=""
RUN if [ -n "${EXTRA_APT_PACKAGES}" ]; then \
        apt-get update \
        && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${EXTRA_APT_PACKAGES} \
        && rm -rf /var/lib/apt/lists/*; \
    fi
