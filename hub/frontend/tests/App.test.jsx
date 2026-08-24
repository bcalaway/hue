// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.jsx";

const STATE = {
  sites: {
    nyc: {
      available: true,
      rooms: [
        // Listed first here on purpose -- the "empty rooms sort last"
        // tests below only mean something if the raw order doesn't
        // already happen to put it last.
        { id: "room-empty", name: "Empty Room", lights: [], scenes: [], grouped_light_id: "grouped-empty" },
        {
          id: "room-1",
          name: "Living Room",
          lights: [
            { id: "light-1", name: "Lamp", on: false, brightness: 0, color_hex: "", dimmable: true },
            { id: "light-2", name: "Fountain plug", on: true, brightness: 0, color_hex: "", dimmable: false },
          ],
          scenes: [
            { id: "scene-1", name: "Movie night", active: false, color_hex: "#0000ff" },
            { id: "scene-2", name: "Bright", active: true, color_hex: "#ffffff" },
            { id: "scene-3", name: "Concentrate", active: false, color_hex: "#00ffff" },
          ],
          grouped_light_id: "grouped-1",
        },
      ],
      unassigned_lights: [],
      automations: [
        {
          id: "auto-1",
          name: "Sunset",
          enabled: true,
          status: "running",
          configuration_json: '{"when":{"time_point":{"time":"sunset"}}}',
        },
      ],
    },
    rambles: { available: false, rooms: [], unassigned_lights: [], automations: [] },
  },
};

const EXISTING_ANIMATION = {
  id: 1,
  site: "nyc",
  room_id: "room-1",
  room_name: "Living Room",
  scenes: [
    { id: "scene-1", name: "Movie night" },
    { id: "scene-2", name: "Bright" },
  ],
  interval_seconds: 10,
  enabled: true,
  running: true,
};

function mockFetch() {
  return vi.fn((url, options) => {
    if (url === "/api/state") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(STATE) });
    }
    if (options?.method === "POST" || options?.method === "DELETE") {
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({ ok: false });
  });
}

// Same as mockFetch, but GET /api/site/nyc/animations returns a real
// existing animation for Living Room -- used only by the live-edit test,
// which needs `existing` to be truthy in AnimationControls.
function mockFetchWithExistingAnimation() {
  return vi.fn((url, options) => {
    if (url === "/api/state") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(STATE) });
    }
    if (url === "/api/site/nyc/animations" && (!options || options.method === undefined)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([EXISTING_ANIMATION]) });
    }
    if (options?.method === "POST" || options?.method === "DELETE") {
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({ ok: false });
  });
}

function roomNameOrder(container) {
  return Array.from(container.querySelectorAll(".room-name")).map((el) => el.textContent);
}

async function expandLivingRoom() {
  const toggle = await screen.findByRole("button", { name: /Living Room/ });
  await userEvent.click(toggle);
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  it("renders a collapsed room with a light/color summary but no light tiles", async () => {
    render(<App />);
    expect(await screen.findByText("Living Room")).toBeInTheDocument();
    expect(screen.queryByText("Lamp")).not.toBeInTheDocument();
  });

  it("expands a room to reveal lights, scenes, and the animate panel", async () => {
    render(<App />);
    await expandLivingRoom();

    expect(screen.getByText("Lamp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Movie night/ })).toBeInTheDocument();
    expect(screen.getByText("Animate")).toBeInTheDocument();
  });

  it("sorts an empty room after a room with lights, even though the API returned it first", async () => {
    const { container } = render(<App />);
    await screen.findByText("Living Room");

    expect(roomNameOrder(container)).toEqual(["Living Room", "Empty Room"]);
  });

  it("moves a favorited room to the top, ahead of a non-favorite room with lights", async () => {
    const { container } = render(<App />);
    await screen.findByText("Empty Room");

    // Both rooms start unfavorited, so both stars share the same
    // accessible name -- sort order (asserted above) puts Living Room
    // first, Empty Room second, so index 1 is Empty Room's star.
    const stars = screen.getAllByRole("button", { name: "Favorite this room" });
    await userEvent.click(stars[1]);

    expect(roomNameOrder(container)).toEqual(["Empty Room", "Living Room"]);
    expect(fetch).toHaveBeenCalledWith("/api/site/nyc/favorites/room-empty", { method: "POST" });
  });

  it("shows 'on' instead of a percentage for a non-dimmable light (e.g. a smart plug)", async () => {
    render(<App />);
    await expandLivingRoom();

    const plugTile = screen.getByRole("button", { name: /Fountain plug/ });
    expect(plugTile).toHaveTextContent("on");
    expect(plugTile).not.toHaveTextContent("%");
  });

  it("shows automation status and reveals its definition on click", async () => {
    render(<App />);
    expect(await screen.findByText("Sunset")).toBeInTheDocument();

    expect(screen.queryByText(/time_point/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show definition" }));

    expect(screen.getByText(/time_point/)).toBeInTheDocument();
  });

  it("toggles a light's on/off state by calling the API", async () => {
    render(<App />);
    await expandLivingRoom();
    const tile = screen.getByRole("button", { name: /Lamp/ });

    await userEvent.click(tile);

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/light/light-1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ on: true }) }),
    );
  });

  it("activates a scene by calling the API, and deactivates the previously-active scene in that room", async () => {
    render(<App />);
    await expandLivingRoom();
    const movieNight = screen.getByRole("button", { name: /Movie night/ });
    const bright = screen.getByRole("button", { name: /Bright/ });
    // Fixture starts with "Bright" active -- this is the bug Bill hit for
    // real: clicking another scene in the same room left the old one
    // showing active (green) too, since nothing ever cleared it.
    expect(bright.className).toContain("active");

    await userEvent.click(movieNight);

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/scene/scene-1/activate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(movieNight.className).toContain("active");
    expect(bright.className).not.toContain("active");
  });

  it("toggles a whole room off via the room-level circle (Living Room starts with a light on)", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: "Turn room off" });

    await userEvent.click(toggle);

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/grouped-light/grouped-1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ on: false }) }),
    );
  });

  it("toggles a whole room on via the room-level circle (Empty Room starts fully off)", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: "Turn room on" });

    await userEvent.click(toggle);

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/grouped-light/grouped-empty",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ on: true }) }),
    );
  });

  it("creates a scene-alternation animation for a room, defaulting to a 5s interval", async () => {
    render(<App />);
    await expandLivingRoom();

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/animations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          room_id: "room-1",
          room_name: "Living Room",
          scenes: [
            { id: "scene-1", name: "Movie night" },
            { id: "scene-2", name: "Bright" },
          ],
          interval_seconds: 5,
        }),
      }),
    );
  });

  it("live-edits an existing animation's interval with no separate save step", async () => {
    vi.stubGlobal("fetch", mockFetchWithExistingAnimation());
    render(<App />);
    await expandLivingRoom();

    // An existing animation renders Stop/Start directly -- no "Edit" button
    // gating the form behind an extra click.
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Interval in seconds"), "30");

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/animations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          room_id: "room-1",
          room_name: "Living Room",
          scenes: [
            { id: "scene-1", name: "Movie night" },
            { id: "scene-2", name: "Bright" },
          ],
          interval_seconds: 30,
        }),
      }),
    );
  });

  it("adds a third scene to an existing animation's sequence and saves immediately", async () => {
    vi.stubGlobal("fetch", mockFetchWithExistingAnimation());
    render(<App />);
    await expandLivingRoom();

    await userEvent.click(screen.getByRole("button", { name: "+ Scene" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/animations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          room_id: "room-1",
          room_name: "Living Room",
          scenes: [
            { id: "scene-1", name: "Movie night" },
            { id: "scene-2", name: "Bright" },
            { id: "scene-3", name: "Concentrate" },
          ],
          interval_seconds: 10,
        }),
      }),
    );
  });

  it("shows the unavailable message for a site with no reachable agent", async () => {
    render(<App />);
    await screen.findByText("Living Room");

    await userEvent.selectOptions(screen.getByRole("combobox"), "rambles");

    expect(screen.getByText("Agent unreachable — no live data.")).toBeInTheDocument();
  });

  it("polls /api/state periodically so an animation's scene changes show up without a manual reload", async () => {
    // advanceTimersByTimeAsync (not waitFor, which polls on its own real-time
    // schedule and doesn't mix well with fake timers) both advances fake
    // timers and flushes the microtask queue in between, so the plain
    // Promises mockFetch returns actually resolve along the way.
    vi.useFakeTimers();
    render(<App />);

    await vi.advanceTimersByTimeAsync(0);
    const initialCalls = fetch.mock.calls.filter((call) => call[0] === "/api/state").length;
    expect(initialCalls).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(5000);
    const callsAfterPoll = fetch.mock.calls.filter((call) => call[0] === "/api/state").length;

    expect(callsAfterPoll).toBeGreaterThan(initialCalls);
    vi.useRealTimers();
  });
});
