#include <gtest/gtest.h>

#include "config.hpp"

TEST(ConfigTest, DefaultsWhenNoEnvVarsSet) {
  Config config = Config::from_env();

  EXPECT_EQ(config.site, "nyc");
  EXPECT_EQ(config.grpc_port, 9090);
  EXPECT_TRUE(config.hue_bridge_host.empty());
  EXPECT_TRUE(config.hue_api_key.empty());
}
