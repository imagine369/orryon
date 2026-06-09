import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { deviceMotionRequiresGesture } from "./platform.ts";
import {
  MOTION_GRANTED_STORAGE_KEY,
  probeDeviceMotionSample,
  readAmbientMotionGrantedStorage,
  storeAmbientMotionGranted,
  validateAmbientMotionStorageGrant,
  wasAmbientMotionPermissionGranted,
} from "./ambient-motion-permission.ts";

function createSessionStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
}

function installMotionWindow({ requestPermission, emitMotionOnListen = false } = {}) {
  let motionHandler = null;
  const win = {
    DeviceMotionEvent: requestPermission
      ? { requestPermission }
      : function DeviceMotionEvent() {},
    addEventListener: (type, handler) => {
      if (type === "devicemotion") motionHandler = handler;
      if (emitMotionOnListen && motionHandler) {
        queueMicrotask(() => {
          motionHandler?.({
            accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
          });
        });
      }
    },
    removeEventListener: (type) => {
      if (type === "devicemotion") motionHandler = null;
    },
    dispatchMotion: (event) => motionHandler?.(event),
  };
  globalThis.window = win;
  globalThis.DeviceMotionEvent = win.DeviceMotionEvent;
  return win;
}

describe("deviceMotionRequiresGesture", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    delete globalThis.DeviceMotionEvent;
  });

  it("returns false when window is undefined", () => {
    delete globalThis.window;
    assert.equal(deviceMotionRequiresGesture(), false);
  });

  it("returns true when DeviceMotionEvent.requestPermission exists", () => {
    installMotionWindow({
      requestPermission: async () => "granted",
    });
    assert.equal(deviceMotionRequiresGesture(), true);
  });

  it("returns false when requestPermission is absent", () => {
    installMotionWindow();
    assert.equal(deviceMotionRequiresGesture(), false);
  });
});

describe("ambient motion storage", () => {
  const originalSessionStorage = globalThis.sessionStorage;

  beforeEach(() => {
    globalThis.sessionStorage = createSessionStorage();
  });

  afterEach(() => {
    if (originalSessionStorage === undefined) {
      delete globalThis.sessionStorage;
    } else {
      globalThis.sessionStorage = originalSessionStorage;
    }
  });

  it("reads and writes the granted flag", () => {
    assert.equal(readAmbientMotionGrantedStorage(), false);
    storeAmbientMotionGranted(true);
    assert.equal(
      globalThis.sessionStorage.getItem(MOTION_GRANTED_STORAGE_KEY),
      "1",
    );
    assert.equal(readAmbientMotionGrantedStorage(), true);
    storeAmbientMotionGranted(false);
    assert.equal(readAmbientMotionGrantedStorage(), false);
  });

  it("calls onGranted only when storing true", () => {
    let calls = 0;
    storeAmbientMotionGranted(true, () => {
      calls += 1;
    });
    assert.equal(calls, 1);
    storeAmbientMotionGranted(false, () => {
      calls += 1;
    });
    assert.equal(calls, 1);
  });
});

describe("wasAmbientMotionPermissionGranted", () => {
  const originalWindow = globalThis.window;
  const originalSessionStorage = globalThis.sessionStorage;

  beforeEach(() => {
    globalThis.sessionStorage = createSessionStorage();
  });

  afterEach(() => {
    if (originalSessionStorage === undefined) {
      delete globalThis.sessionStorage;
    } else {
      globalThis.sessionStorage = originalSessionStorage;
    }
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    delete globalThis.DeviceMotionEvent;
  });

  it("returns true on platforms without gesture requirement", () => {
    installMotionWindow();
    assert.equal(wasAmbientMotionPermissionGranted(), true);
  });

  it("returns false on gesture platforms without storage", () => {
    installMotionWindow({
      requestPermission: async () => "granted",
    });
    assert.equal(wasAmbientMotionPermissionGranted(), false);
  });

  it("returns true on gesture platforms when storage is set", () => {
    installMotionWindow({
      requestPermission: async () => "granted",
    });
    storeAmbientMotionGranted(true);
    assert.equal(wasAmbientMotionPermissionGranted(), true);
  });
});

describe("probeDeviceMotionSample", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    delete globalThis.DeviceMotionEvent;
  });

  it("resolves true when a non-zero sample arrives", async () => {
    const win = installMotionWindow();
    const promise = probeDeviceMotionSample(100);
    win.dispatchMotion({
      accelerationIncludingGravity: { x: 0.1, y: 0.2, z: 9.7 },
    });
    assert.equal(await promise, true);
  });

  it("ignores all-zero samples", async () => {
    const win = installMotionWindow();
    const promise = probeDeviceMotionSample(30);
    win.dispatchMotion({
      accelerationIncludingGravity: { x: 0, y: 0, z: 0 },
    });
    assert.equal(await promise, false);
  });

  it("resolves false on timeout", async () => {
    installMotionWindow();
    assert.equal(await probeDeviceMotionSample(20), false);
  });
});

describe("validateAmbientMotionStorageGrant", () => {
  const originalWindow = globalThis.window;
  const originalSessionStorage = globalThis.sessionStorage;

  beforeEach(() => {
    globalThis.sessionStorage = createSessionStorage();
  });

  afterEach(() => {
    if (originalSessionStorage === undefined) {
      delete globalThis.sessionStorage;
    } else {
      globalThis.sessionStorage = originalSessionStorage;
    }
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    delete globalThis.DeviceMotionEvent;
    mock.restoreAll();
  });

  it("clears stale storage and calls onRevoked when probe fails", async () => {
    installMotionWindow({
      requestPermission: async () => "granted",
    });
    storeAmbientMotionGranted(true);

    let revoked = false;
    const ok = await validateAmbientMotionStorageGrant({
      timeoutMs: 20,
      onRevoked: () => {
        revoked = true;
      },
    });

    assert.equal(ok, false);
    assert.equal(revoked, true);
    assert.equal(readAmbientMotionGrantedStorage(), false);
  });

  it("returns true when storage grant probes successfully", async () => {
    installMotionWindow({
      requestPermission: async () => "granted",
      emitMotionOnListen: true,
    });
    storeAmbientMotionGranted(true);

    const ok = await validateAmbientMotionStorageGrant({ timeoutMs: 100 });
    assert.equal(ok, true);
    assert.equal(readAmbientMotionGrantedStorage(), true);
  });
});
