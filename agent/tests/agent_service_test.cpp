#include <gtest/gtest.h>

#include "agent_service.hpp"

namespace {

// Fake bridge -- lets AgentServiceImpl be tested without a real Hue Bridge
// on the network. Shaped to exercise the room/light/scene correlation
// AgentServiceImpl now does itself: one light in a room, one light with no
// room (device id the fake rooms don't list), one scene attached to that
// room, and one scene attached to a zone (which should be dropped, since
// there's no room card for it to render under).
class FakeHueClient : public IHueClient {
 public:
  std::vector<HueLight> GetLights() override {
    return {
        {.id = "light-1",
         .name = "Front door",
         .on = true,
         .brightness = 75.5,
         .color_hex = "#ff0000",
         .owner_device_id = "device-1",
         .dimmable = true},
        {.id = "light-2",
         .name = "Garage",
         .on = false,
         .brightness = 0.0,
         .color_hex = "",
         .owner_device_id = "device-unassigned",
         .dimmable = true},
        // A smart plug: on/off only, no "dimming" service at all -- the
        // real bug this fixture exercises (confirmed live: a plug showing
        // "on" but the hub rendering it as "0%" before `dimmable` existed).
        {.id = "light-3",
         .name = "Fountain plug",
         .on = true,
         .brightness = 0.0,
         .color_hex = "",
         .owner_device_id = "device-1",
         .dimmable = false},
    };
  }

  std::vector<HueScene> GetScenes() override {
    return {
        {.id = "scene-1",
         .name = "Movie night",
         .active = false,
         .color_hex = "#0000ff",
         .group_id = "room-1",
         .group_is_room = true},
        {.id = "scene-2",
         .name = "Whole floor",
         .active = true,
         .color_hex = "#00ff00",
         .group_id = "zone-1",
         .group_is_room = false},
    };
  }

  std::vector<HueAutomation> GetAutomations() override {
    return {{.id = "auto-1",
             .name = "Sunset",
             .enabled = true,
             .status = "running",
             .configuration_json = R"({"when":{"time_point":{"time":"sunset"}}})"}};
  }

  std::vector<HueRoom> GetRooms() override {
    return {{.id = "room-1",
             .name = "Living Room",
             .device_ids = {"device-1"},
             .grouped_light_id = "grouped-light-1"}};
  }

  bool SetLightOn(const std::string& light_id, bool on) override {
    last_light_id = light_id;
    last_on = on;
    return set_light_on_result;
  }

  bool RecallScene(const std::string& scene_id, int duration_ms) override {
    last_scene_id = scene_id;
    last_duration_ms = duration_ms;
    return recall_scene_result;
  }

  bool SetGroupedLightOn(const std::string& grouped_light_id, bool on) override {
    last_grouped_light_id = grouped_light_id;
    last_grouped_light_on = on;
    return set_grouped_light_on_result;
  }

  std::string last_light_id;
  bool last_on = false;
  bool set_light_on_result = true;

  std::string last_scene_id;
  int last_duration_ms = -1;
  bool recall_scene_result = true;

  std::string last_grouped_light_id;
  bool last_grouped_light_on = false;
  bool set_grouped_light_on_result = true;
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

  ASSERT_EQ(response.rooms_size(), 1);
  const auto& room = response.rooms(0);
  EXPECT_EQ(room.name(), "Living Room");
  EXPECT_EQ(room.grouped_light_id(), "grouped-light-1");

  ASSERT_EQ(room.lights_size(), 2);
  EXPECT_EQ(room.lights(0).id(), "light-1");
  EXPECT_EQ(room.lights(0).name(), "Front door");
  EXPECT_TRUE(room.lights(0).on());
  EXPECT_DOUBLE_EQ(room.lights(0).brightness(), 75.5);
  EXPECT_EQ(room.lights(0).color_hex(), "#ff0000");
  EXPECT_TRUE(room.lights(0).dimmable());

  // The smart plug: on, but not dimmable -- the hub uses this flag to show
  // "on" instead of a meaningless "0%".
  EXPECT_EQ(room.lights(1).id(), "light-3");
  EXPECT_TRUE(room.lights(1).on());
  EXPECT_FALSE(room.lights(1).dimmable());

  // Only the room-scoped scene made it in -- the zone-scoped one was dropped.
  ASSERT_EQ(room.scenes_size(), 1);
  EXPECT_EQ(room.scenes(0).name(), "Movie night");
  EXPECT_FALSE(room.scenes(0).active());
  EXPECT_EQ(room.scenes(0).color_hex(), "#0000ff");

  ASSERT_EQ(response.unassigned_lights_size(), 1);
  EXPECT_EQ(response.unassigned_lights(0).id(), "light-2");
  EXPECT_EQ(response.unassigned_lights(0).color_hex(), "");

  ASSERT_EQ(response.automations_size(), 1);
  EXPECT_EQ(response.automations(0).name(), "Sunset");
  EXPECT_TRUE(response.automations(0).enabled());
  EXPECT_EQ(response.automations(0).status(), "running");
  EXPECT_EQ(response.automations(0).configuration_json(), R"({"when":{"time_point":{"time":"sunset"}}})");
}

TEST(AgentServiceTest, SetLightStatePassesThroughToTheBridgeAndReportsSuccess) {
  FakeHueClient fake_client;
  AgentServiceImpl service(fake_client, "nyc");

  grpc::ServerContext context;
  hue::SetLightStateRequest request;
  request.set_light_id("light-1");
  request.set_on(true);
  hue::SetLightStateResponse response;

  grpc::Status status = service.SetLightState(&context, &request, &response);

  ASSERT_TRUE(status.ok());
  EXPECT_TRUE(response.ok());
  EXPECT_EQ(response.error(), "");
  EXPECT_EQ(fake_client.last_light_id, "light-1");
  EXPECT_TRUE(fake_client.last_on);
}

TEST(AgentServiceTest, SetLightStateReportsBridgeFailureWithoutThrowing) {
  FakeHueClient fake_client;
  fake_client.set_light_on_result = false;
  AgentServiceImpl service(fake_client, "nyc");

  grpc::ServerContext context;
  hue::SetLightStateRequest request;
  request.set_light_id("light-1");
  request.set_on(false);
  hue::SetLightStateResponse response;

  grpc::Status status = service.SetLightState(&context, &request, &response);

  ASSERT_TRUE(status.ok());
  EXPECT_FALSE(response.ok());
  EXPECT_NE(response.error(), "");
}

TEST(AgentServiceTest, ActivateScenePassesThroughToTheBridgeAndReportsSuccess) {
  FakeHueClient fake_client;
  AgentServiceImpl service(fake_client, "nyc");

  grpc::ServerContext context;
  hue::ActivateSceneRequest request;
  request.set_scene_id("scene-1");
  hue::ActivateSceneResponse response;

  grpc::Status status = service.ActivateScene(&context, &request, &response);

  ASSERT_TRUE(status.ok());
  EXPECT_TRUE(response.ok());
  EXPECT_EQ(fake_client.last_scene_id, "scene-1");
  EXPECT_EQ(fake_client.last_duration_ms, 0);
}

TEST(AgentServiceTest, ActivateScenePassesThroughADurationForCrossfading) {
  FakeHueClient fake_client;
  AgentServiceImpl service(fake_client, "nyc");

  grpc::ServerContext context;
  hue::ActivateSceneRequest request;
  request.set_scene_id("scene-1");
  request.set_duration_ms(3000);
  hue::ActivateSceneResponse response;

  grpc::Status status = service.ActivateScene(&context, &request, &response);

  ASSERT_TRUE(status.ok());
  EXPECT_EQ(fake_client.last_duration_ms, 3000);
}

TEST(AgentServiceTest, ActivateSceneReportsBridgeFailureWithoutThrowing) {
  FakeHueClient fake_client;
  fake_client.recall_scene_result = false;
  AgentServiceImpl service(fake_client, "nyc");

  grpc::ServerContext context;
  hue::ActivateSceneRequest request;
  request.set_scene_id("scene-1");
  hue::ActivateSceneResponse response;

  grpc::Status status = service.ActivateScene(&context, &request, &response);

  ASSERT_TRUE(status.ok());
  EXPECT_FALSE(response.ok());
  EXPECT_NE(response.error(), "");
}

TEST(AgentServiceTest, SetGroupedLightStatePassesThroughToTheBridgeAndReportsSuccess) {
  FakeHueClient fake_client;
  AgentServiceImpl service(fake_client, "nyc");

  grpc::ServerContext context;
  hue::SetGroupedLightStateRequest request;
  request.set_grouped_light_id("grouped-light-1");
  request.set_on(false);
  hue::SetGroupedLightStateResponse response;

  grpc::Status status = service.SetGroupedLightState(&context, &request, &response);

  ASSERT_TRUE(status.ok());
  EXPECT_TRUE(response.ok());
  EXPECT_EQ(fake_client.last_grouped_light_id, "grouped-light-1");
  EXPECT_FALSE(fake_client.last_grouped_light_on);
}

TEST(AgentServiceTest, SetGroupedLightStateReportsBridgeFailureWithoutThrowing) {
  FakeHueClient fake_client;
  fake_client.set_grouped_light_on_result = false;
  AgentServiceImpl service(fake_client, "nyc");

  grpc::ServerContext context;
  hue::SetGroupedLightStateRequest request;
  request.set_grouped_light_id("grouped-light-1");
  request.set_on(false);
  hue::SetGroupedLightStateResponse response;

  grpc::Status status = service.SetGroupedLightState(&context, &request, &response);

  ASSERT_TRUE(status.ok());
  EXPECT_FALSE(response.ok());
  EXPECT_NE(response.error(), "");
}
