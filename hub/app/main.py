import pathlib

from authlib.integrations.starlette_client import OAuth
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.grpc_client import get_all_states

STATIC_DIR = pathlib.Path(__file__).parent / "static"

# Routes reachable without an authenticated session -- everything else
# (including /static/*, checked separately below) is gated by
# RequireAuthMiddleware.
PUBLIC_PATHS = {"/health", "/login", "/auth/callback"}

app = FastAPI(title=settings.app_name)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class RequireAuthMiddleware(BaseHTTPMiddleware):
    # Only enforced once real Authentik credentials are configured -- see
    # CLAUDE.md's Gotchas in nyc_pa_aws_gitops for why this exists at all
    # (todo-app shipped without it at first).
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not _auth_configured or path in PUBLIC_PATHS or path.startswith("/static/"):
            return await call_next(request)
        if not request.session.get("user"):
            if path.startswith("/api/"):
                return JSONResponse({"error": "authentication required"}, status_code=401)
            return RedirectResponse(url="/login")
        return await call_next(request)


# Starlette's add_middleware prepends to the middleware list, so the
# middleware added LAST runs FIRST on an incoming request. RequireAuthMiddleware
# reads request.session, so it must run after SessionMiddleware -- meaning
# RequireAuthMiddleware has to be added first, SessionMiddleware second.
app.add_middleware(RequireAuthMiddleware)
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)

oauth = OAuth()
_auth_configured = bool(settings.authentik_client_id and settings.authentik_client_secret)
if _auth_configured:
    oauth.register(
        name="authentik",
        client_id=settings.authentik_client_id,
        client_secret=settings.authentik_client_secret,
        server_metadata_url=(
            f"{settings.authentik_base_url}/application/o/{settings.app_name}/"
            ".well-known/openid-configuration"
        ),
        client_kwargs={"scope": "openid profile email"},
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return FileResponse(STATIC_DIR / "index.html")


def _light_dict(light):
    return {
        "id": light.id,
        "name": light.name,
        "on": light.on,
        "brightness": light.brightness,
        "color_hex": light.color_hex,
    }


def _scene_dict(scene):
    return {"id": scene.id, "name": scene.name, "active": scene.active, "color_hex": scene.color_hex}


@app.get("/api/state")
def api_state():
    states = get_all_states()
    sites = {}
    for site, state in states.items():
        if state is None:
            sites[site] = {"available": False, "rooms": [], "unassigned_lights": [], "automations": []}
            continue
        sites[site] = {
            "available": True,
            "rooms": [
                {
                    "id": room.id,
                    "name": room.name,
                    "lights": [_light_dict(light) for light in room.lights],
                    "scenes": [_scene_dict(scene) for scene in room.scenes],
                }
                for room in state.rooms
            ],
            "unassigned_lights": [_light_dict(light) for light in state.unassigned_lights],
            "automations": [
                {"id": a.id, "name": a.name, "enabled": a.enabled, "status": a.status}
                for a in state.automations
            ],
        }
    return {"sites": sites}


@app.get("/login")
async def login(request: Request):
    if not _auth_configured:
        return JSONResponse({"error": "auth not configured"}, status_code=501)
    redirect_uri = str(request.url_for("auth_callback"))
    return await oauth.authentik.authorize_redirect(request, redirect_uri)


@app.get("/auth/callback")
async def auth_callback(request: Request):
    if not _auth_configured:
        return JSONResponse({"error": "auth not configured"}, status_code=501)
    token = await oauth.authentik.authorize_access_token(request)
    request.session["user"] = token.get("userinfo")
    return RedirectResponse(url="/")
