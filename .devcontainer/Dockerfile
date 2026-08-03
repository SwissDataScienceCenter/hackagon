ARG BASE_IMAGE=mcr.microsoft.com/devcontainers/base:ubuntu-24.04
FROM ${BASE_IMAGE}

# Space-separated list of extra apt packages to bake into the image
# (set HACKAGON_DEV_EXTRA_APT_PACKAGES in .devcontainer/.env).
ARG EXTRA_APT_PACKAGES=""
RUN if [ -n "${EXTRA_APT_PACKAGES}" ]; then \
        apt-get update \
        && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${EXTRA_APT_PACKAGES} \
        && rm -rf /var/lib/apt/lists/*; \
    fi
