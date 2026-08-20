#include "config.hpp"

#include <cstdlib>

namespace {

std::string env_or(const char* name, std::string default_value) {
  const char* value = std::getenv(name);
  return value != nullptr ? std::string(value) : std::move(default_value);
}

int env_int_or(const char* name, int default_value) {
  const char* value = std::getenv(name);
  if (value == nullptr) return default_value;
  try {
    return std::stoi(value);
  } catch (...) {
    return default_value;
  }
}

}  // namespace

Config Config::from_env() {
  return Config{
      .site = env_or("SITE", "nyc"),
      .hue_bridge_host = env_or("HUE_BRIDGE_HOST", ""),
      .hue_api_key = env_or("HUE_API_KEY", ""),
      .grpc_port = env_int_or("GRPC_PORT", 9090),
  };
}
