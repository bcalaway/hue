#pragma once

#include <string>
#include <vector>

struct HueLight {
  std::string id;
  std::string name;
  bool on = false;
  double brightness = 0.0;  // 0-100, CLIP v2's native percentage
  std::string color_hex;    // "#rrggbb", empty if this light has no color
  std::string owner_device_id;  // CLIP v2 light.owner.rid -- HueClient has
                                 // no notion of rooms itself, so
                                 // AgentServiceImpl does the light->room
                                 // correlation against HueRoom::device_ids
};

struct HueScene {
  std::string id;
  std::string name;
  bool active = false;
  std::string color_hex;  // "#rrggbb" representative swatch, may be empty
  std::string group_id;   // CLIP v2 scene.group.rid
  bool group_is_room = false;  // false when the group is a zone instead
};

struct HueAutomation {
  std::string id;
  std::string name;
  bool enabled = false;
  std::string status;
};

struct HueRoom {
  std::string id;
  std::string name;
  std::vector<std::string> device_ids;  // CLIP v2 room.children device rids
};

// Abstraction over the Hue Bridge's local CLIP v2 API, so AgentServiceImpl
// can be unit-tested against a fake without a real bridge on the network.
class IHueClient {
 public:
  virtual ~IHueClient() = default;
  virtual std::vector<HueLight> GetLights() = 0;
  virtual std::vector<HueScene> GetScenes() = 0;
  virtual std::vector<HueAutomation> GetAutomations() = 0;
  virtual std::vector<HueRoom> GetRooms() = 0;

  // Returns false (with no exception) on any transport/HTTP-level failure --
  // callers (AgentServiceImpl) turn that into a gRPC response with ok=false
  // rather than a thrown error, since "the bridge rejected this" is a
  // routine, expected outcome (e.g. a stale light id), not a program bug.
  virtual bool SetLightOn(const std::string& light_id, bool on) = 0;
  virtual bool RecallScene(const std::string& scene_id) = 0;
};

// Talks to a real Hue Bridge over its local CLIP v2 API (HTTPS,
// self-signed cert). Certificate verification is deliberately disabled --
// the bridge is only ever reached over its LAN IP on a trusted local
// network (never the internet), and Hue's self-signed cert isn't issued
// per-IP in a way standard verification could meaningfully check anyway.
// Field shapes below (brightness as 0-100, scene.status.active,
// behavior_instance.enabled/status, room.children as device rids, a
// light's owner as a device rid, scene.group as either a room or a zone)
// were confirmed against a real bridge, not assumed from documentation --
// see proto/agent_service.proto's comments in the hue repo.
class HueClient : public IHueClient {
 public:
  HueClient(std::string bridge_host, std::string api_key);

  std::vector<HueLight> GetLights() override;
  std::vector<HueScene> GetScenes() override;
  std::vector<HueAutomation> GetAutomations() override;
  std::vector<HueRoom> GetRooms() override;
  bool SetLightOn(const std::string& light_id, bool on) override;
  bool RecallScene(const std::string& scene_id) override;

 private:
  std::string bridge_host_;
  std::string api_key_;
};
