#include <grpcpp/grpcpp.h>
#include <grpcpp/health_check_service_interface.h>

#include <iostream>
#include <memory>

#include "agent_service.hpp"
#include "config.hpp"
#include "hue_client.hpp"

int main() {
  Config config = Config::from_env();

  if (config.hue_bridge_host.empty() || config.hue_api_key.empty()) {
    std::cerr << "HUE_BRIDGE_HOST and HUE_API_KEY must both be set" << std::endl;
    return 1;
  }

  HueClient hue_client(config.hue_bridge_host, config.hue_api_key);
  AgentServiceImpl service(hue_client, config.site);

  // Standard grpc.health.v1.Health service (ADR-0020) -- a caller doesn't
  // need any hue-specific RPC just to check liveness.
  grpc::EnableDefaultHealthCheckService(true);

  std::string address = "0.0.0.0:" + std::to_string(config.grpc_port);
  grpc::ServerBuilder builder;
  builder.AddListeningPort(address, grpc::InsecureServerCredentials());
  builder.RegisterService(&service);

  std::unique_ptr<grpc::Server> server(builder.BuildAndStart());
  std::cout << "hue-agent (" << config.site << ") listening on :" << config.grpc_port
            << ", bridge " << config.hue_bridge_host << std::endl;
  server->Wait();

  return 0;
}
