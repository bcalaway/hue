# Multi-stage build following nyc_pa_aws_gitops's app-ci.yml convention:
# `lint` and `test` stages ahead of the final runtime stage.
#
# Build context is the REPO ROOT, not hub/ -- this Dockerfile needs
# ../proto/agent_service.proto (outside hub/ itself, so unreachable if the
# build context were scoped to hub/ alone). Build/push from the repo root:
# `docker build -f hub/Dockerfile .`
#
# The frontend (hub/frontend/, React + Vite) is a separate Node build
# baked into the Python image's static/ dir at build time -- there's no
# Node runtime in the final image, just its static output. app-ci.yml only
# ever builds one --target per check (lint/test/final), so the frontend's
# own lint/test have to hang off the SAME targets as the backend's rather
# than being separate CI steps -- forced via COPY --from, same technique
# the protoc stage below already uses to inject generated code.

FROM node:24-slim AS frontend-base
WORKDIR /frontend
COPY hub/frontend/package*.json ./
RUN npm ci
COPY hub/frontend/ ./

FROM frontend-base AS frontend-lint
RUN npm run lint

FROM frontend-base AS frontend-build
RUN npm run build

FROM frontend-build AS frontend-test
RUN npm test

FROM python:3.12-slim AS base
WORKDIR /app
COPY hub/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY hub/app/ app/
COPY --from=frontend-build /frontend/dist app/static/

# Separate ephemeral stage for protoc codegen -- keeps grpcio-tools (which
# bundles its own protoc binary, unnecessary bulk) out of both `base` and
# `final`'s installed packages. Only the generated .py output crosses into
# the stages that actually need it.
FROM python:3.12-slim AS protoc
WORKDIR /gen
RUN pip install --no-cache-dir grpcio-tools==1.83.0
COPY proto/ proto/
RUN mkdir -p generated \
    && python -m grpc_tools.protoc -Iproto --python_out=generated --grpc_python_out=generated proto/agent_service.proto \
    && touch generated/__init__.py

FROM base AS with-proto
COPY --from=protoc /gen/generated/ app/generated/

FROM with-proto AS dev
COPY hub/requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY hub/tests/ tests/
COPY hub/ruff.toml .

FROM dev AS lint
RUN ruff check app/ tests/
COPY --from=frontend-lint /frontend/package.json /tmp/frontend-lint-marker

FROM dev AS test
RUN pytest
COPY --from=frontend-test /frontend/package.json /tmp/frontend-test-marker

FROM with-proto AS final
EXPOSE 8000
# --proxy-headers/--forwarded-allow-ips: Traefik terminates TLS and proxies
# to the app over plain HTTP on the internal Docker network. Without this,
# uvicorn ignores Traefik's X-Forwarded-Proto and builds http:// redirect
# URIs (e.g. for OIDC) -- see CLAUDE.md's Gotchas in nyc_pa_aws_gitops for
# how this broke todo-app's login in production.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
