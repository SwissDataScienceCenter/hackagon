ARG BASE_IMAGE=mcr.microsoft.com/devcontainers/base:ubuntu-24.04
FROM ${BASE_IMAGE}

# System libraries Playwright's Firefox links against. `playwright install
# --with-deps` apt-installs these at runtime, but that writes to the
# container's writable layer, so they vanish the moment the container is
# recreated (e.g. any docker-compose change) and the e2e suite then dies with
# "libgtk-3.so.0: cannot open shared object file". Baking them into the image
# makes the browser survive recreation.
# Kept in sync with `playwright install --with-deps firefox` on Ubuntu 24.04.
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
        && rm -rf /var/lib/apt/lists/*; \
    fi

# Space-separated list of extra apt packages to bake into the image
# (set HACKAGON_DEV_EXTRA_APT_PACKAGES in .devcontainer/.env).
ARG EXTRA_APT_PACKAGES=""
RUN if [ -n "${EXTRA_APT_PACKAGES}" ]; then \
        apt-get update \
        && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${EXTRA_APT_PACKAGES} \
        && rm -rf /var/lib/apt/lists/*; \
    fi
