# hue

Household Hue lighting controller (Milestone 12 of [nyc_pa_aws_gitops](https://github.com/bcalaway/nyc_pa_aws_gitops)'s roadmap). See that repo's [`docs/app-platform.md`](https://github.com/bcalaway/nyc_pa_aws_gitops/blob/main/docs/app-platform.md) for the platform contract this app implements — this README covers what's specific to `hue`, not general platform mechanics.

## Shape

Two components in one repo, following [ADR-0020](https://github.com/bcalaway/nyc_pa_aws_gitops/blob/main/docs/adr/0020-grpc-for-service-to-service.md):

- **`hub/`** (Python) — the browser-facing app. Deploys to the AWS hub like every other app on the platform, reachable at `https://hue.billandjessie.com`, gated behind Authentik. Talks to the local agent over gRPC to get live state; has no direct connection to any Hue bridge itself.
- **`agent/`** (C++) — one instance per site (NYC/Rambles), deployed to that site's NUC. The only thing that talks to that site's Hue bridge directly. Internal-only gRPC server, never exposed through Traefik or the internet — reachable by the hub over the existing WireGuard mesh.

`proto/agent_service.proto` is the contract between them, shared by both build systems (CMake on the C++ side, `grpc_tools.protoc` on the Python side).

## Status

Read-only MVP plus direct control (as of 2026-08-22): see what's on, what scenes exist and which is active, what automations are configured and running, PLUS turn a light on/off or activate a room's scene directly from the hub. Scene-alternation animations (flip between two scenes on a timer) are next. Hue's own automation engine stays primary; this app only steps in for direct control and advanced automations, not as a replacement.

Both sites live as of 2026-08-21 — NYC and Rambles each have a running agent, and the hub's `/api/state` and UI show both side by side (`{"sites": {"nyc": {...}, "rambles": {...}}}`), one section per site.

The hub's UI (`hub/frontend/`) is a React + Vite frontend, styled to match the `billandjessie.com` landing page's dark theme, built into the Python backend's static assets at Docker build time (see `hub/Dockerfile`) — there's no Node runtime in the final image.

## Local development

Each component has its own README-level detail in its own directory (`hub/`, `agent/`) — see those for build/test/run instructions specific to each language's toolchain.

Both need `proto/agent_service.proto` to build: the C++ side generates code via CMake at configure time, the Python side via `grpc_tools.protoc` (a separate Docker build stage, or run by hand locally — see `hub/Dockerfile`'s `protoc` stage for the exact command).

The hub's frontend (`hub/frontend/`) is developed separately from its backend: `npm run dev` (Vite, hot-reloading) proxies `/api`, `/health`, `/login`, and `/auth/callback` to a locally-running backend (`uvicorn app.main:app --port 8000` from `hub/`) — see `hub/frontend/vite.config.js`. `npm run build` produces the static output the backend serves in production; there's no need to run that by hand outside Docker, `hub/Dockerfile` does it as part of the image build.
