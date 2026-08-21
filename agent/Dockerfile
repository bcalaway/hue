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
# Known slow-build problem, not yet solved: the vcpkg install step's cache
# mount doesn't reliably round-trip through the `cache-from/cache-to:
# type=gha` backend across separate CI runs (a known BuildKit/GHA
# limitation), so grpc's whole dependency tree (protobuf, abseil, re2,
# c-ares, openssl) tends to recompile from source on every build,
# 10-25+ minutes regardless of what actually changed. Tried switching to
# vcpkg's x-gha binary caching backend on 2026-08-21 -- turned out that's
# been removed from current vcpkg (silently warns and no-ops instead of
# erroring, so that attempt built with zero caching at all, worse than
# this). Reverted. A real fix needs vcpkg's current NuGet-based binary
# caching provider, not yet implemented -- needs more research before
# spending another CI cycle on it.

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
# Reverted 2026-08-21: tried vcpkg's x-gha binary caching backend here,
# but it's been removed from current vcpkg (silently warns and no-ops
# rather than erroring, so that attempt built with zero caching at all --
# worse than this). Back to the plain local cache mount for now; a real
# fix needs vcpkg's current NuGet-based binary caching provider, which
# needs more research before spending another CI cycle on it. See
# templates/cpp/Dockerfile in nyc_pa_aws_gitops for the same open problem.
RUN --mount=type=cache,target=/vcpkg-cache \
    VCPKG_DEFAULT_BINARY_CACHE=/vcpkg-cache \
    /opt/vcpkg/vcpkg install --triplet x64-linux --x-install-root=/app/vcpkg_installed

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
