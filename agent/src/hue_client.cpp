#include "hue_client.hpp"

#include <httplib.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace {

nlohmann::json get_resource(httplib::Client& cli, const std::string& path) {
  auto res = cli.Get(path);
  if (!res || res->status != 200) return nlohmann::json::array();
  auto json = nlohmann::json::parse(res->body, nullptr, false);
  if (json.is_discarded() || !json.contains("data")) return nlohmann::json::array();
  return json.at("data");
}

std::string name_of(const nlohmann::json& item) {
  return item.value("metadata", nlohmann::json::object()).value("name", "");
}

std::string hex_of(int r, int g, int b) {
  char buf[8];
  std::snprintf(buf, sizeof(buf), "#%02x%02x%02x", std::clamp(r, 0, 255), std::clamp(g, 0, 255), std::clamp(b, 0, 255));
  return buf;
}

// Standard CIE xy -> sRGB conversion (Philips' own published algorithm for
// Hue, reproduced by essentially every third-party Hue integration).
// Brightness is deliberately fixed at full (1.0) rather than the light's
// actual dimming level -- this is for a UI color swatch that should stay a
// recognizable, vivid hue even when the real light is dimmed low, not a
// physically-accurate rendering of its current output.
std::string xy_to_hex(double x, double y) {
  if (y <= 0.0) return "";
  double z = 1.0 - x - y;
  double Y = 1.0;
  double X = (Y / y) * x;
  double Z = (Y / y) * z;

  double r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  double g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  double b = X * 0.051713 - Y * 0.121364 + Z * 1.011530;

  auto gamma_correct = [](double c) {
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * std::pow(c, 1.0 / 2.4) - 0.055;
    return std::clamp(c, 0.0, 1.0);
  };
  r = gamma_correct(r);
  g = gamma_correct(g);
  b = gamma_correct(b);

  // Renormalize so the brightest channel hits full scale -- the raw
  // conversion above is often dim for saturated colors near the edge of
  // the bulb's gamut, which would otherwise make a "red" swatch look
  // muddy/gray instead of vivid.
  double max_c = std::max({r, g, b, 1e-6});
  return hex_of(static_cast<int>(r / max_c * 255 + 0.5), static_cast<int>(g / max_c * 255 + 0.5),
                static_cast<int>(b / max_c * 255 + 0.5));
}

// Tanner Helland's widely-reproduced blackbody-radiation approximation, for
// tunable-white-only lights that have color_temperature but no xy color.
std::string mirek_to_hex(int mirek) {
  if (mirek <= 0) return "";
  double kelvin = 1000000.0 / mirek;
  double temp = kelvin / 100.0;

  double r = temp <= 66 ? 255.0 : 329.698727446 * std::pow(temp - 60, -0.1332047592);
  double g = temp <= 66 ? 99.4708025861 * std::log(temp) - 161.1195681661
                        : 288.1221695283 * std::pow(temp - 60, -0.0755148492);
  double b;
  if (temp >= 66) {
    b = 255.0;
  } else if (temp <= 19) {
    b = 0.0;
  } else {
    b = 138.5177312231 * std::log(temp - 10) - 305.0447927307;
  }

  auto to255 = [](double v) { return static_cast<int>(std::clamp(v, 0.0, 255.0) + 0.5); };
  return hex_of(to255(r), to255(g), to255(b));
}

// A light's color comes from either its "color" (xy) or, for tunable-white
// lights without full color, its "color_temperature" (mirek) -- confirmed
// live that plain dimmable/on-off lights (e.g. this bridge's "Tree") have
// neither key present at all.
std::string color_of(const nlohmann::json& item) {
  if (item.contains("color")) {
    auto xy = item.at("color").value("xy", nlohmann::json::object());
    if (xy.contains("x") && xy.contains("y")) {
      return xy_to_hex(xy.value("x", 0.0), xy.value("y", 0.0));
    }
  }
  if (item.contains("color_temperature")) {
    auto ct = item.at("color_temperature");
    if (ct.value("mirek_valid", false)) {
      return mirek_to_hex(ct.value("mirek", 0));
    }
  }
  return "";
}

}  // namespace

HueClient::HueClient(std::string bridge_host, std::string api_key)
    : bridge_host_(std::move(bridge_host)), api_key_(std::move(api_key)) {}

std::vector<HueLight> HueClient::GetLights() {
  httplib::Client cli("https://" + bridge_host_);
  cli.enable_server_certificate_verification(false);
  cli.set_default_headers({{"hue-application-key", api_key_}});
  cli.set_connection_timeout(5);

  std::vector<HueLight> lights;
  for (const auto& item : get_resource(cli, "/clip/v2/resource/light")) {
    HueLight light;
    light.id = item.value("id", "");
    light.name = name_of(item);
    light.on = item.value("on", nlohmann::json::object()).value("on", false);
    light.brightness = item.value("dimming", nlohmann::json::object()).value("brightness", 0.0);
    light.color_hex = color_of(item);
    light.owner_device_id = item.value("owner", nlohmann::json::object()).value("rid", "");
    lights.push_back(std::move(light));
  }
  return lights;
}

std::vector<HueScene> HueClient::GetScenes() {
  httplib::Client cli("https://" + bridge_host_);
  cli.enable_server_certificate_verification(false);
  cli.set_default_headers({{"hue-application-key", api_key_}});
  cli.set_connection_timeout(5);

  std::vector<HueScene> scenes;
  for (const auto& item : get_resource(cli, "/clip/v2/resource/scene")) {
    HueScene scene;
    scene.id = item.value("id", "");
    scene.name = name_of(item);
    // CLIP v2's own status.active field -- "inactive" when not recalled,
    // something else ("static"/"dynamic_palette") when it is. Confirmed
    // live against a real bridge, not assumed from Hue's docs.
    std::string active_status = item.value("status", nlohmann::json::object()).value("active", "inactive");
    scene.active = active_status != "inactive";

    // Representative swatch: first color in the scene's own palette (what
    // the Hue app itself shows as the scene's icon color), falling back to
    // the first per-light action's color, then to a color-temperature
    // equivalent of either -- confirmed live that a scene's palette can be
    // empty (color-temperature-only scenes) while actions still carry data.
    auto palette = item.value("palette", nlohmann::json::object());
    auto palette_colors = palette.value("color", nlohmann::json::array());
    auto actions = item.value("actions", nlohmann::json::array());
    if (!palette_colors.empty() && palette_colors[0].contains("color")) {
      auto xy = palette_colors[0].at("color").value("xy", nlohmann::json::object());
      scene.color_hex = xy_to_hex(xy.value("x", 0.0), xy.value("y", 0.0));
    } else if (!actions.empty() && actions[0].value("action", nlohmann::json::object()).contains("color")) {
      auto xy = actions[0].at("action").at("color").value("xy", nlohmann::json::object());
      scene.color_hex = xy_to_hex(xy.value("x", 0.0), xy.value("y", 0.0));
    } else {
      auto palette_ct = palette.value("color_temperature", nlohmann::json::array());
      if (!palette_ct.empty() && palette_ct[0].contains("color_temperature")) {
        scene.color_hex = mirek_to_hex(palette_ct[0].at("color_temperature").value("mirek", 0));
      }
    }

    auto group = item.value("group", nlohmann::json::object());
    scene.group_id = group.value("rid", "");
    scene.group_is_room = group.value("rtype", "") == "room";

    scenes.push_back(std::move(scene));
  }
  return scenes;
}

std::vector<HueAutomation> HueClient::GetAutomations() {
  httplib::Client cli("https://" + bridge_host_);
  cli.enable_server_certificate_verification(false);
  cli.set_default_headers({{"hue-application-key", api_key_}});
  cli.set_connection_timeout(5);

  std::vector<HueAutomation> automations;
  for (const auto& item : get_resource(cli, "/clip/v2/resource/behavior_instance")) {
    HueAutomation automation;
    automation.id = item.value("id", "");
    automation.name = name_of(item);
    automation.enabled = item.value("enabled", false);
    automation.status = item.value("status", "");
    automations.push_back(std::move(automation));
  }
  return automations;
}

std::vector<HueRoom> HueClient::GetRooms() {
  httplib::Client cli("https://" + bridge_host_);
  cli.enable_server_certificate_verification(false);
  cli.set_default_headers({{"hue-application-key", api_key_}});
  cli.set_connection_timeout(5);

  std::vector<HueRoom> rooms;
  for (const auto& item : get_resource(cli, "/clip/v2/resource/room")) {
    HueRoom room;
    room.id = item.value("id", "");
    room.name = name_of(item);
    for (const auto& child : item.value("children", nlohmann::json::array())) {
      if (child.value("rtype", "") == "device") {
        room.device_ids.push_back(child.value("rid", ""));
      }
    }
    rooms.push_back(std::move(room));
  }
  return rooms;
}
