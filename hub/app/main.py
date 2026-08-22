import pathlib
from contextlib import asynccontextmanager

from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app import animator
from app.config import settings
from app.db import SessionLocal, create_tables, get_db
from app.grpc_client import activate_scene, get_all_states, set_grouped_light_state, set_light_state
from app.models import Animation, Favorite
from app.schemas import AnimationCreate, AnimationOut

STATIC_DIR = pathlib.Path(__file__).parent / "static"

# Routes reachable without an authenticated session -- everything else
# (including /static/*, checked separately below) is gated by
# RequireAuthMiddleware.
PUBLIC_PATHS = {"/health", "/login", "/auth/callback"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    # Rebuild running animation tasks from the database's `enabled` rows --
    # a redeploy kills every in-process asyncio task, so this is what makes
    # an animation survive one (see animator.py's module docstring).
    if SessionLocal is not None:
        db = SessionLocal()
        try:
            for animation in db.query(Animation).filter(Animation.enabled == True).all():  # noqa: E712
                animator.start(
                    animation.id,
                    animation.site,
                    animation.scene_a_id,
                    animation.scene_b_id,
                    animation.interval_seconds,
                )
        finally:
            db.close()
    yield
    animator.stop_all()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
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
# max_age: Starlette's own default is 14 days, separate from however long
# Authentik's own SSO session lasts (nyc_pa_aws_gitops's
# compose/aws/authentik/blueprints/session-duration.yaml). ~10 years so
# Bill isn't asked to log in again until he explicitly logs out.
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, max_age=60 * 60 * 24 * 3650)

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
        "dimmable": light.dimmable,
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
                    "grouped_light_id": room.grouped_light_id,
                }
                for room in state.rooms
            ],
            "unassigned_lights": [_light_dict(light) for light in state.unassigned_lights],
            "automations": [
                {
                    "id": a.id,
                    "name": a.name,
                    "enabled": a.enabled,
                    "status": a.status,
                    "configuration_json": a.configuration_json,
                }
                for a in state.automations
            ],
        }
    return {"sites": sites}


class SetLightStateBody(BaseModel):
    on: bool


@app.post("/api/site/{site}/light/{light_id}")
def api_set_light_state(site: str, light_id: str, body: SetLightStateBody):
    host = settings.agent_hosts.get(site, "")
    ok, error = set_light_state(host, light_id, body.on)
    if not ok:
        return JSONResponse({"ok": False, "error": error}, status_code=502)
    return {"ok": True}


@app.post("/api/site/{site}/scene/{scene_id}/activate")
def api_activate_scene(site: str, scene_id: str):
    host = settings.agent_hosts.get(site, "")
    ok, error = activate_scene(host, scene_id)
    if not ok:
        return JSONResponse({"ok": False, "error": error}, status_code=502)
    return {"ok": True}


@app.post("/api/site/{site}/grouped-light/{grouped_light_id}")
def api_set_room_state(site: str, grouped_light_id: str, body: SetLightStateBody):
    # Same shape as api_set_light_state -- a room's grouped_light is just
    # another CLIP v2 on/off resource, so the room-level toggle in the UI
    # (the header's on/off circle) can turn a room on just as easily as off.
    host = settings.agent_hosts.get(site, "")
    ok, error = set_grouped_light_state(host, grouped_light_id, body.on)
    if not ok:
        return JSONResponse({"ok": False, "error": error}, status_code=502)
    return {"ok": True}


@app.get("/api/site/{site}/animations")
def api_list_animations(site: str, db: Session = Depends(get_db)):
    animations = db.query(Animation).filter(Animation.site == site).order_by(Animation.id).all()
    return [
        {**AnimationOut.model_validate(a).model_dump(mode="json"), "running": animator.is_running(a.id)}
        for a in animations
    ]


@app.post("/api/site/{site}/animations")
async def api_create_animation(site: str, body: AnimationCreate, db: Session = Depends(get_db)):
    # async def, not sync -- animator.start() calls asyncio.create_task(),
    # which needs a running event loop in the calling thread. A plain `def`
    # endpoint runs in FastAPI's worker threadpool instead, where there is
    # no event loop at all; `async def` runs directly on the event loop.
    #
    # Upsert on (site, room_id) -- at most one animation per room (see the
    # UniqueConstraint in models.py for why). Submitting the form again for
    # a room that already has one replaces its scenes/interval and
    # restarts its loop, rather than stacking a second competing animation.
    animation = db.query(Animation).filter(Animation.site == site, Animation.room_id == body.room_id).first()
    if animation is not None:
        animator.stop(animation.id)
        for field, value in body.model_dump().items():
            setattr(animation, field, value)
        animation.enabled = True
    else:
        animation = Animation(site=site, enabled=True, **body.model_dump())
        db.add(animation)
    db.commit()
    db.refresh(animation)
    animator.start(
        animation.id, site, animation.scene_a_id, animation.scene_b_id, animation.interval_seconds
    )
    return {**AnimationOut.model_validate(animation).model_dump(mode="json"), "running": True}


def _get_animation_or_404(site: str, animation_id: int, db: Session) -> Animation:
    animation = db.query(Animation).filter(Animation.id == animation_id, Animation.site == site).first()
    if animation is None:
        raise HTTPException(status_code=404, detail="animation not found")
    return animation


@app.post("/api/site/{site}/animations/{animation_id}/stop")
async def api_stop_animation(site: str, animation_id: int, db: Session = Depends(get_db)):
    animation = _get_animation_or_404(site, animation_id, db)
    animator.stop(animation_id)
    animation.enabled = False
    db.commit()
    return {"ok": True}


@app.post("/api/site/{site}/animations/{animation_id}/start")
async def api_start_animation(site: str, animation_id: int, db: Session = Depends(get_db)):
    animation = _get_animation_or_404(site, animation_id, db)
    animation.enabled = True
    db.commit()
    animator.start(
        animation.id, site, animation.scene_a_id, animation.scene_b_id, animation.interval_seconds
    )
    return {"ok": True}


@app.get("/api/site/{site}/favorites")
def api_list_favorites(site: str, db: Session = Depends(get_db)):
    favorites = db.query(Favorite).filter(Favorite.site == site).all()
    return {"room_ids": [f.room_id for f in favorites]}


@app.post("/api/site/{site}/favorites/{room_id}")
def api_add_favorite(site: str, room_id: str, db: Session = Depends(get_db)):
    existing = db.query(Favorite).filter(Favorite.site == site, Favorite.room_id == room_id).first()
    if existing is None:
        db.add(Favorite(site=site, room_id=room_id))
        db.commit()
    return {"ok": True}


@app.delete("/api/site/{site}/favorites/{room_id}")
def api_remove_favorite(site: str, room_id: str, db: Session = Depends(get_db)):
    db.query(Favorite).filter(Favorite.site == site, Favorite.room_id == room_id).delete()
    db.commit()
    return {"ok": True}


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
