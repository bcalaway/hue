#pragma once

#include <string>

// Set per-site by Ansible when deploying to each NUC (nuc4/NYC,
// nuc5/Rambles) -- see the NUC deploy mechanism in
// nyc_pa_aws_gitops/ansible/. HUE_API_KEY comes from SSM
// (/home-platform/hue/nyc-api-key or rambles-api-key), never committed.
struct Config {
  std::string site;            // "nyc" or "rambles"
  std::string hue_bridge_host; // e.g. "10.0.1.71"
  std::string hue_api_key;
  int grpc_port;

  static Config from_env();
};
