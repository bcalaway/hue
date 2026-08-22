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
          scenes: [{ id: "scene-1", name: "Movie night", active: false, color_hex: "#0000ff" }],
        },
      ],
      unassigned_lights: [],
      automations: [{ id: "auto-1", name: "Sunset", enabled: true, status: "running" }],
    },
    rambles: { available: false, rooms: [], unassigned_lights: [], automations: [] },
  },
};

function mockFetch() {
  return vi.fn((url, options) => {
    if (url === "/api/state") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(STATE) });
    }
    if (options?.method === "POST") {
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({ ok: false });
  });
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  it("renders rooms, lights, scenes, and automations for the default site", async () => {
    render(<App />);
    expect(await screen.findByText("Living Room")).toBeInTheDocument();
    expect(screen.getByText("Lamp")).toBeInTheDocument();
    expect(screen.getByText("Movie night")).toBeInTheDocument();
    expect(screen.getByText("Sunset")).toBeInTheDocument();
  });

  it("toggles a light's on/off state by calling the API", async () => {
    render(<App />);
    const tile = await screen.findByRole("button", { name: /Lamp/ });

    await userEvent.click(tile);

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/light/light-1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ on: true }) }),
    );
  });

  it("activates a scene by calling the API", async () => {
    render(<App />);
    const chip = await screen.findByRole("button", { name: /Movie night/ });

    await userEvent.click(chip);

    expect(fetch).toHaveBeenCalledWith(
      "/api/site/nyc/scene/scene-1/activate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the unavailable message for a site with no reachable agent", async () => {
    render(<App />);
    await screen.findByText("Living Room");

    await userEvent.selectOptions(screen.getByRole("combobox"), "rambles");

    expect(screen.getByText("Agent unreachable — no live data.")).toBeInTheDocument();
  });
});
