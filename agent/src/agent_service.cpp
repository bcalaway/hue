#include "agent_service.hpp"

grpc::Status AgentServiceImpl::GetState(grpc::ServerContext* /*context*/, const hue::GetStateRequest* /*request*/,
                                        hue::GetStateResponse* response) {
  response->set_site(site_);

  for (const auto& light : hue_client_.GetLights()) {
    auto* out = response->add_lights();
    out->set_id(light.id);
    out->set_name(light.name);
    out->set_on(light.on);
    out->set_brightness(light.brightness);
  }

  for (const auto& scene : hue_client_.GetScenes()) {
    auto* out = response->add_scenes();
    out->set_id(scene.id);
    out->set_name(scene.name);
    out->set_active(scene.active);
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
