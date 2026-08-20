#include "hue_client.hpp"

#include <httplib.h>
#include <nlohmann/json.hpp>

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
