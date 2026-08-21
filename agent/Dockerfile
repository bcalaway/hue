# Multi-stage build following nyc_pa_aws_gitops's app-ci.yml convention:
# `lint` and `test` stages ahead of the final runtime stage.
#
# Build context is the REPO ROOT, not agent/ -- this Dockerfile needs
# ../proto/agent_service.proto, which is outside agent/ itself and
# therefore unreachable if Docker's build context were scoped to agent/
# alone. Build/push from the repo root: `docker build -f agent/Dockerfile .`
#
# See templates/cpp/Dockerfile in nyc_pa_aws_gitops for the vcpkg binary
# cache mount / bison+flex / CMAKE_CXX_SCAN_FOR_MODULES notes -- same
# reasoning applies here, not re-explained inline.
#
# Known slow-build problem: without a real binary cache, grpc's whole
# dependency tree (protobuf, abseil, re2, c-ares, openssl) recompiles from
# source on every build, 10-25+ minutes regardless of what actually
# changed. A first fix attempt (2026-08-21) tried vcpkg's x-gha binary
# caching backend -- turned out that's been removed from current vcpkg
# entirely (silently warns and no-ops instead of erroring, so that attempt
# built with zero caching at all, worse than the plain cache-mount
# fallback it replaced). Reverted; see git history for that attempt.
#
# Current fix: GitHub Packages via a NuGet feed, vcpkg's own currently-
# documented/recommended approach for GitHub Actions --
# https://learn.microsoft.com/vcpkg/consume/binary-caching-github-packages
# (verified against that live doc 2026-08-21, not assumed). The built-in
# GITHUB_TOKEN doesn't have package-registry permissions for this per that
# same doc, so it needs a real PAT with packages:write, passed in as a
# build secret (never baked into the image or any layer) -- see cd.yml.

FROM ubuntu:24.04 AS base
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential clang clang-tidy cmake ninja-build git curl zip unzip tar pkg-config ca-certificates python3 \
      bison flex mono-complete \
    && rm -rf /var/lib/apt/lists/*
ENV CC=clang CXX=clang++

RUN git clone --depth 1 https://github.com/microsoft/vcpkg.git /opt/vcpkg \
    && /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics
ENV VCPKG_ROOT=/opt/vcpkg

WORKDIR /app
COPY agent/vcpkg.json ./
# Falls back to the plain local cache mount when the PAT secret isn't
# present (e.g. building this image locally, or in the pull_request-
# triggered ci.yml path, which doesn't have secrets access for a fork PR).
RUN --mount=type=secret,id=vcpkg_pat \
    --mount=type=cache,target=/vcpkg-cache \
    sh -c '\
      if [ -s /run/secrets/vcpkg_pat ]; then \
        PAT="$(cat /run/secrets/vcpkg_pat)"; \
        FEED_URL="https://nuget.pkg.github.com/bcalaway/index.json"; \
        NUGET_EXE="$(/opt/vcpkg/vcpkg fetch nuget | tail -n 1)"; \
        mono "$NUGET_EXE" sources add -Source "$FEED_URL" -StorePasswordInClearText -Name GitHubPackages -UserName bcalaway -Password "$PAT"; \
        mono "$NUGET_EXE" setapikey "$PAT" -Source "$FEED_URL"; \
        export VCPKG_BINARY_SOURCES="clear;nuget,$FEED_URL,readwrite"; \
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
