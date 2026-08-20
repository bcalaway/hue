# hue

Household Hue lighting controller (Milestone 12 of [nyc_pa_aws_gitops](https://github.com/bcalaway/nyc_pa_aws_gitops)'s roadmap). See that repo's [`docs/app-platform.md`](https://github.com/bcalaway/nyc_pa_aws_gitops/blob/main/docs/app-platform.md) for the platform contract this app implements — this README covers what's specific to `hue`, not general platform mechanics.

## Shape

Two components in one repo, following [ADR-0020](https://github.com/bcalaway/nyc_pa_aws_gitops/blob/main/docs/adr/0020-grpc-for-service-to-service.md):

- **`hub/`** (Python) — the browser-facing app. Deploys to the AWS hub like every other app on the platform, reachable at `https://hue.billandjessie.com`, gated behind Authentik. Talks to the local agent over gRPC to get live state; has no direct connection to any Hue bridge itself.
- **`agent/`** (C++) — one instance per site (NYC/Rambles), deployed to that site's NUC. The only thing that talks to that site's Hue bridge directly. Internal-only gRPC server, never exposed through Traefik or the internet — reachable by the hub over the existing WireGuard mesh.

`proto/agent_service.proto` is the contract between them, shared by both build systems (CMake on the C++ side, `grpc_tools.protoc` on the Python side).

## Status

MVP (current phase): read-only. See what's on, what scenes exist and which is active, what automations are configured and running. Kicking off scenes/automations, and eventually a small set of "advanced" automations beyond what Hue's own engine supports, are later phases — not built yet. Hue's own automation engine stays primary; this app only steps in for direct control and (eventually) advanced automations, not as a replacement.

NYC-only for now — Rambles' agent gets stood up once that site's Hue bridge API key exists and multi-site aggregation in the UI is actually designed.

## Local development

Each component has its own README-level detail in its own directory (`hub/`, `agent/`) — see those for build/test/run instructions specific to each language's toolchain.

Both need `proto/agent_service.proto` to build: the C++ side generates code via CMake at configure time, the Python side via `grpc_tools.protoc` (a separate Docker build stage, or run by hand locally — see `hub/Dockerfile`'s `protoc` stage for the exact command).
