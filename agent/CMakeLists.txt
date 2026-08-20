cmake_minimum_required(VERSION 3.28)
project(hue_agent CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# See templates/cpp/CMakeLists.txt in nyc_pa_aws_gitops (and CLAUDE.md's
# Gotchas) for why this is needed: CMake 3.28's Ninja generator scans for
# C++20 modules by default whenever the standard is >= 20, which injects a
# response-file argument into compile_commands.json that clang-tidy can't
# parse. This project doesn't use modules.
set(CMAKE_CXX_SCAN_FOR_MODULES OFF)

find_package(Protobuf CONFIG REQUIRED)
find_package(gRPC CONFIG REQUIRED)
find_package(GTest CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(httplib CONFIG REQUIRED)

# --- Protobuf/gRPC codegen -------------------------------------------------
# The contract lives at the repo root (../proto), shared between hub/ and
# agent/ -- see proto/agent_service.proto's own header comment.
set(PROTO_FILE "${CMAKE_SOURCE_DIR}/../proto/agent_service.proto")
set(PROTO_IMPORT_DIR "${CMAKE_SOURCE_DIR}/../proto")
set(GENERATED_DIR "${CMAKE_BINARY_DIR}/generated")
file(MAKE_DIRECTORY "${GENERATED_DIR}")

set(PROTO_SRCS "${GENERATED_DIR}/agent_service.pb.cc")
set(PROTO_HDRS "${GENERATED_DIR}/agent_service.pb.h")
set(GRPC_SRCS "${GENERATED_DIR}/agent_service.grpc.pb.cc")
set(GRPC_HDRS "${GENERATED_DIR}/agent_service.grpc.pb.h")

add_custom_command(
  OUTPUT "${PROTO_SRCS}" "${PROTO_HDRS}" "${GRPC_SRCS}" "${GRPC_HDRS}"
  COMMAND protobuf::protoc
  ARGS --cpp_out "${GENERATED_DIR}"
       --grpc_out "${GENERATED_DIR}"
       --plugin=protoc-gen-grpc=$<TARGET_FILE:gRPC::grpc_cpp_plugin>
       -I "${PROTO_IMPORT_DIR}"
       "${PROTO_FILE}"
  DEPENDS "${PROTO_FILE}" protobuf::protoc gRPC::grpc_cpp_plugin
  COMMENT "Generating gRPC code from agent_service.proto"
)

add_library(proto_gen STATIC ${PROTO_SRCS} ${PROTO_HDRS} ${GRPC_SRCS} ${GRPC_HDRS})
target_link_libraries(proto_gen PUBLIC protobuf::libprotobuf gRPC::grpc++)
target_include_directories(proto_gen PUBLIC "${GENERATED_DIR}")

# --- Agent library (everything except main(), so tests can link it too) ---
add_library(agent_lib STATIC
  src/config.cpp
  src/hue_client.cpp
  src/agent_service.cpp
)
target_include_directories(agent_lib PUBLIC src)
target_link_libraries(agent_lib PUBLIC
  proto_gen
  httplib::httplib
  nlohmann_json::nlohmann_json
)

add_executable(agent src/main.cpp)
target_link_libraries(agent PRIVATE agent_lib)

# --- Tests -------------------------------------------------------------------
enable_testing()
add_executable(agent_tests
  tests/config_test.cpp
  tests/agent_service_test.cpp
)
target_link_libraries(agent_tests PRIVATE agent_lib GTest::gtest GTest::gtest_main)

include(GoogleTest)
gtest_discover_tests(agent_tests)
