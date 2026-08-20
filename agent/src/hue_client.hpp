#pragma once

#include <string>
#include <vector>

struct HueLight {
  std::string id;
  std::string name;
  bool on = false;
  double brightness = 0.0;  // 0-100, CLIP v2's native percentage
};

struct HueScene {
  std::string id;
  std::string name;
  bool active = false;
};

struct HueAutomation {
  std::string id;
  std::string name;
  bool enabled = false;
  std::string status;
};

// Abstraction over the Hue Bridge's local CLIP v2 API, so AgentServiceImpl
// can be unit-tested against a fake without a real bridge on the network.
class IHueClient {
 public:
  virtual ~IHueClient() = default;
  virtual std::vector<HueLight> GetLights() = 0;
  virtual std::vector<HueScene> GetScenes() = 0;
  virtual std::vector<HueAutomation> GetAutomations() = 0;
};

// Talks to a real Hue Bridge over its local CLIP v2 API (HTTPS,
// self-signed cert). Certificate verification is deliberately disabled --
// the bridge is only ever reached over its LAN IP on a trusted local
// network (never the internet), and Hue's self-signed cert isn't issued
// per-IP in a way standard verification could meaningfully check anyway.
// Field shapes below (brightness as 0-100, scene.status.active,
// behavior_instance.enabled/status) were confirmed against a real bridge,
// not assumed from documentation -- see proto/agent_service.proto's
// comments in the hue repo.
class HueClient : public IHueClient {
 public:
  HueClient(std::string bridge_host, std::string api_key);

  std::vector<HueLight> GetLights() override;
  std::vector<HueScene> GetScenes() override;
  std::vector<HueAutomation> GetAutomations() override;

 private:
  std::string bridge_host_;
  std::string api_key_;
};
