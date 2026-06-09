import assert from "node:assert/strict";
import test from "node:test";

import { hostnameFromHostHeader, isDemoRouteAllowed } from "./demo-mode-server.ts";

function mockReq(host) {
  return {
    headers: {
      get: (name) => (name === "host" ? host : null),
    },
  };
}

test("hostnameFromHostHeader parses IPv4 and bracketed IPv6", () => {
  assert.equal(hostnameFromHostHeader("localhost:3000"), "localhost");
  assert.equal(hostnameFromHostHeader("127.0.0.1:3000"), "127.0.0.1");
  assert.equal(hostnameFromHostHeader("[::1]:3000"), "::1");
});

test("isDemoRouteAllowed accepts localhost and IPv6 loopback", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercelEnv = process.env.VERCEL_ENV;
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL_ENV;

  try {
    assert.equal(isDemoRouteAllowed(mockReq("localhost:3000")), true);
    assert.equal(isDemoRouteAllowed(mockReq("127.0.0.1:3000")), true);
    assert.equal(isDemoRouteAllowed(mockReq("[::1]:3000")), true);
    assert.equal(isDemoRouteAllowed(mockReq("orryon.com")), false);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercelEnv;
  }
});
