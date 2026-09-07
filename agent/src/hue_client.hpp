#pragma once

#include <string>
#include <vector>

struct HueLight {
  std::string id;
  std::string name;
  bool on = false;
  double brightness = 0.0;  // 0-100, CLIP v2's native percentage. Meaningless
                             // when dimmable is false.
  std::string color_hex;    // "#rrggbb", empty if this light has no color
  std::string owner_device_id;  // CLIP v2 light.owner.rid -- HueClient has
                                 // no notion of rooms itself, so
                                 // AgentServiceImpl does the light->room
                                 // correlation against HueRoom::device_ids
  bool dimmable = false;    // Whether this light's CLIP v2 resource has a
                             // "dimming" service -- false for on/off-only
                             // devices like Hue smart plugs.
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
  std::string configuration_json;  // raw JSON text, see the proto comment
};

struct HueRoom {
  std::string id;
  std::string name;
  std::vector<std::string> device_ids;  // CLIP v2 room.children device rids
  std::string grouped_light_id;         // CLIP v2 room.services[] entry
                                         // with rtype "grouped_light"
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
  // Sets `dimming.brightness` and `on.on=true` in one PUT -- see the
  // SetLightBrightness RPC comment. `brightness` is expected pre-clamped to
  // 1-100 by the caller (the hub does this).
  virtual bool SetLightBrightness(const std::string& light_id, double brightness) = 0;
  // duration_ms of 0 omits CLIP v2's recall.duration entirely (bridge's own
  // default transition); a positive value crossfades over that many ms.
  virtual bool RecallScene(const std::string& scene_id, int duration_ms) = 0;
  virtual bool SetGroupedLightOn(const std::string& grouped_light_id, bool on) = 0;
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
  bool SetLightBrightness(const std::string& light_id, double brightness) override;
  bool RecallScene(const std::string& scene_id, int duration_ms) override;
  bool SetGroupedLightOn(const std::string& grouped_light_id, bool on) override;

 private:
  std::string bridge_host_;
  std::string api_key_;
};
