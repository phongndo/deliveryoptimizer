#pragma once

namespace drogon {
class HttpAppFramework;
}

namespace deliveryoptimizer::api {

void RegisterOptimizeJobStatusEndpoint(drogon::HttpAppFramework& app);

} // namespace deliveryoptimizer::api
