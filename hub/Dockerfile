# Multi-stage build following nyc_pa_aws_gitops's app-ci.yml convention:
# `lint` and `test` stages ahead of the final runtime stage.
#
# Build context is the REPO ROOT, not hub/ -- this Dockerfile needs
# ../proto/agent_service.proto (outside hub/ itself, so unreachable if the
# build context were scoped to hub/ alone). Build/push from the repo root:
# `docker build -f hub/Dockerfile .`

FROM python:3.12-slim AS base
WORKDIR /app
COPY hub/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY hub/app/ app/

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

FROM dev AS test
RUN pytest

FROM with-proto AS final
EXPOSE 8000
# --proxy-headers/--forwarded-allow-ips: Traefik terminates TLS and proxies
# to the app over plain HTTP on the internal Docker network. Without this,
# uvicorn ignores Traefik's X-Forwarded-Proto and builds http:// redirect
# URIs (e.g. for OIDC) -- see CLAUDE.md's Gotchas in nyc_pa_aws_gitops for
# how this broke todo-app's login in production.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
