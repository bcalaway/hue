# Multi-stage build following nyc_pa_aws_gitops's app-ci.yml convention:
# `lint` and `test` stages ahead of the final runtime stage.
#
# Build context is the REPO ROOT, not agent/ -- this Dockerfile needs
# ../proto/agent_service.proto, which is outside agent/ itself and
# therefore unreachable if Docker's build context were scoped to agent/
# alone. Build/push from the repo root: `docker build -f agent/Dockerfile .`
#
# See templates/cpp/Dockerfile in nyc_pa_aws_gitops for the bison+flex /
# CMAKE_CXX_SCAN_FOR_MODULES notes -- same reasoning applies here, not
# re-explained inline.
#
# vcpkg's binary cache below uses its own native GitHub Actions Cache
# backend (x-gha), not a BuildKit `--mount=type=cache` handed off to the
# `type=gha` layer-cache backend (which is what this used to do, and what
# templates/cpp/Dockerfile in nyc_pa_aws_gitops still does). Confirmed
# 2026-08-21: that combination doesn't reliably round-trip vcpkg's cache
# across separate CI runs -- a known BuildKit/GHA limitation, not a config
# mistake -- so every single build was recompiling grpc and its whole
# dependency tree (protobuf, abseil, re2, c-ares, openssl) from source,
# 10-25+ minutes regardless of what actually changed. x-gha is vcpkg's own
# documented, recommended path for GitHub Actions and talks to the cache
# API directly. The two secrets it needs (ACTIONS_CACHE_URL/
# ACTIONS_RUNTIME_TOKEN) are only present in CI (via
# crazy-max/ghaction-github-runtime in cd.yml) -- falls back to a plain
# local filesystem cache mount for anyone building this image locally.

FROM ubuntu:24.04 AS base
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential clang clang-tidy cmake ninja-build git curl zip unzip tar pkg-config ca-certificates python3 \
      bison flex \
    && rm -rf /var/lib/apt/lists/*
ENV CC=clang CXX=clang++

RUN git clone --depth 1 https://github.com/microsoft/vcpkg.git /opt/vcpkg \
    && /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics
ENV VCPKG_ROOT=/opt/vcpkg

WORKDIR /app
COPY agent/vcpkg.json ./
RUN --mount=type=secret,id=actions_cache_url \
    --mount=type=secret,id=actions_runtime_token \
    --mount=type=cache,target=/vcpkg-cache \
    sh -c '\
      if [ -s /run/secrets/actions_cache_url ]; then \
        export ACTIONS_CACHE_URL="$(cat /run/secrets/actions_cache_url)"; \
        export ACTIONS_RUNTIME_TOKEN="$(cat /run/secrets/actions_runtime_token)"; \
        export VCPKG_BINARY_SOURCES="clear;x-gha,readwrite"; \
      else \
        export VCPKG_DEFAULT_BINARY_CACHE=/vcpkg-cache; \
      fi; \
      /opt/vcpkg/vcpkg install --triplet x64-linux --x-install-root=/app/vcpkg_installed'

COPY agent/CMakeLists.txt ./
COPY proto/ ../proto/
COPY agent/src/ src/
COPY agent/tests/ tests/

RUN cmake -S . -B build -G Ninja \
      -DCMAKE_TOOLCHAIN_FILE=${VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake \
      -DVCPKG_MANIFEST_INSTALL=OFF \
      -DVCPKG_INSTALLED_DIR=/app/vcpkg_installed \
      -DVCPKG_TARGET_TRIPLET=x64-linux \
      -DCMAKE_BUILD_TYPE=Release

FROM base AS lint
RUN cmake --build build --target agent_lib -j
RUN clang-tidy -p build $(find src -name '*.cpp')

FROM base AS test
RUN cmake --build build --target agent_tests -j
RUN ctest --test-dir build --output-on-failure

FROM base AS build-final
RUN cmake --build build --target agent -j

FROM ubuntu:24.04 AS final
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build-final /app/build/agent /usr/local/bin/agent
EXPOSE 9090
CMD ["/usr/local/bin/agent"]
