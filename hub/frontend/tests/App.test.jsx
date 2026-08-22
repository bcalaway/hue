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
        {
          id: "room-1",
          name: "Living Room",
          lights: [{ id: "light-1", name: "Lamp", on: false, brightness: 0, color_hex: "" }],
          scenes: [
            { id: "scene-1", name: "Movie night", active: false, color_hex: "#0000ff" },
            { id: "scene-2", name: "Bright", active: false, color_hex: "#ffffff" },
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
    expect(screen.getByText("Movie night")).toBeInTheDocument();
    expect(screen.getByText("Animate")).toBeInTheDocument();
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

  it("activates a scene by calling the API", async () => {
    render(<App />);
    await expandLivingRoom();
    const chip = screen.getByRole("button", { name: /Movie night/ });

    await userEvent.click(chip);

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/scene/scene-1/activate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("turns off a whole room via the grouped-light endpoint", async () => {
    render(<App />);
    const offButton = await screen.findByRole("button", { name: "Turn off" });

    await userEvent.click(offButton);

    expect(fetch).toHaveBeenCalledWith("/api/site/nyc/grouped-light/grouped-1/off", { method: "POST" });
  });

  it("creates a scene-alternation animation for a room", async () => {
    render(<App />);
    await expandLivingRoom();

    await userEvent.click(screen.getByRole("button", { name: "Start new" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/animations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          room_id: "room-1",
          room_name: "Living Room",
          scene_a_id: "scene-1",
          scene_a_name: "Movie night",
          scene_b_id: "scene-2",
          scene_b_name: "Bright",
          interval_seconds: 30,
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
});
