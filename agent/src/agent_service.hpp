#pragma once

#include "agent_service.grpc.pb.h"
#include "hue_client.hpp"

// Working implementation of the hub<->agent contract (proto/agent_service.proto).
// Takes an IHueClient by reference rather than owning a concrete HueClient,
// so tests can substitute a fake bridge instead of needing a real one on
// the network -- see tests/agent_service_test.cpp.
class AgentServiceImpl final : public hue::AgentService::Service {
 public:
  AgentServiceImpl(IHueClient& hue_client, std::string site) : hue_client_(hue_client), site_(std::move(site)) {}

  grpc::Status GetState(grpc::ServerContext* context, const hue::GetStateRequest* request,
                        hue::GetStateResponse* response) override;
  grpc::Status SetLightState(grpc::ServerContext* context, const hue::SetLightStateRequest* request,
                             hue::SetLightStateResponse* response) override;
  grpc::Status ActivateScene(grpc::ServerContext* context, const hue::ActivateSceneRequest* request,
                             hue::ActivateSceneResponse* response) override;
  grpc::Status SetGroupedLightState(grpc::ServerContext* context, const hue::SetGroupedLightStateRequest* request,
                                    hue::SetGroupedLightStateResponse* response) override;

 private:
  IHueClient& hue_client_;
  std::string site_;
};
