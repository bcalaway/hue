#include <gtest/gtest.h>

#include "agent_service.hpp"

namespace {

// Fake bridge -- lets AgentServiceImpl be tested without a real Hue Bridge
// on the network. Field values chosen to exercise both branches of each
// bool (on/off, active/inactive, enabled/disabled).
class FakeHueClient : public IHueClient {
 public:
  std::vector<HueLight> GetLights() override {
    return {{.id = "light-1", .name = "Front door", .on = true, .brightness = 75.5}};
  }

  std::vector<HueScene> GetScenes() override {
    return {{.id = "scene-1", .name = "Movie night", .active = false}};
  }

  std::vector<HueAutomation> GetAutomations() override {
    return {{.id = "auto-1", .name = "Sunset", .enabled = true, .status = "running"}};
  }
};

}  // namespace

TEST(AgentServiceTest, GetStateReturnsBridgeDataForTheConfiguredSite) {
  FakeHueClient fake_client;
  AgentServiceImpl service(fake_client, "nyc");

  grpc::ServerContext context;
  hue::GetStateRequest request;
  hue::GetStateResponse response;

  grpc::Status status = service.GetState(&context, &request, &response);

  ASSERT_TRUE(status.ok());
  EXPECT_EQ(response.site(), "nyc");

  ASSERT_EQ(response.lights_size(), 1);
  EXPECT_EQ(response.lights(0).id(), "light-1");
  EXPECT_EQ(response.lights(0).name(), "Front door");
  EXPECT_TRUE(response.lights(0).on());
  EXPECT_DOUBLE_EQ(response.lights(0).brightness(), 75.5);

  ASSERT_EQ(response.scenes_size(), 1);
  EXPECT_EQ(response.scenes(0).name(), "Movie night");
  EXPECT_FALSE(response.scenes(0).active());

  ASSERT_EQ(response.automations_size(), 1);
  EXPECT_EQ(response.automations(0).name(), "Sunset");
  EXPECT_TRUE(response.automations(0).enabled());
  EXPECT_EQ(response.automations(0).status(), "running");
}
