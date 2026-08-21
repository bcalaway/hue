#include "agent_service.hpp"

#include <unordered_map>

namespace {

void FillLightProto(const HueLight& light, hue::Light* out) {
  out->set_id(light.id);
  out->set_name(light.name);
  out->set_on(light.on);
  out->set_brightness(light.brightness);
  out->set_color_hex(light.color_hex);
}

}  // namespace

grpc::Status AgentServiceImpl::GetState(grpc::ServerContext* /*context*/, const hue::GetStateRequest* /*request*/,
                                        hue::GetStateResponse* response) {
  response->set_site(site_);

  // Rooms first, so lights/scenes below have somewhere to land -- indexed
  // by room id (for scene correlation) and by owning device id (for light
  // correlation), since neither a light nor a scene names its room
  // directly: a light points at a device, and a room lists its member
  // devices; a scene points at a room (or a zone) by id.
  std::unordered_map<std::string, hue::Room*> rooms_by_id;
  std::unordered_map<std::string, std::string> room_id_by_device_id;
  for (const auto& room : hue_client_.GetRooms()) {
    auto* out = response->add_rooms();
    out->set_id(room.id);
    out->set_name(room.name);
    rooms_by_id[room.id] = out;
    for (const auto& device_id : room.device_ids) {
      room_id_by_device_id[device_id] = room.id;
    }
  }

  for (const auto& light : hue_client_.GetLights()) {
    auto room_it = room_id_by_device_id.find(light.owner_device_id);
    if (room_it != room_id_by_device_id.end()) {
      FillLightProto(light, rooms_by_id.at(room_it->second)->add_lights());
    } else {
      FillLightProto(light, response->add_unassigned_lights());
    }
  }

  // Only scenes actually attached to a room card -- a scene grouped under
  // a zone (cross-room) or somehow ungrouped has nowhere to render yet, so
  // it's dropped here rather than shown unscoped.
  for (const auto& scene : hue_client_.GetScenes()) {
    if (!scene.group_is_room) continue;
    auto room_it = rooms_by_id.find(scene.group_id);
    if (room_it == rooms_by_id.end()) continue;
    auto* out = room_it->second->add_scenes();
    out->set_id(scene.id);
    out->set_name(scene.name);
    out->set_active(scene.active);
    out->set_color_hex(scene.color_hex);
  }

  for (const auto& automation : hue_client_.GetAutomations()) {
    auto* out = response->add_automations();
    out->set_id(automation.id);
    out->set_name(automation.name);
    out->set_enabled(automation.enabled);
    out->set_status(automation.status);
  }

  return grpc::Status::OK;
}
