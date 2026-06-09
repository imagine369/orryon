/* eslint-disable no-var -- declare var is required for global constructor augmentation */
/** Generic Sensor API types (optional browser APIs for ambient fusion). */

interface AmbientSensor extends EventTarget {
  start(): void;
  stop(): void;
  readonly activated: boolean;
  onreading: ((this: AmbientSensor, ev: Event) => void) | null;
  onerror: ((this: AmbientSensor, ev: Event) => void) | null;
  onactivate: ((this: AmbientSensor, ev: Event) => void) | null;
}

interface ProximitySensor extends AmbientSensor {
  readonly near: boolean;
}

declare var ProximitySensor: {
  prototype: ProximitySensor;
  new (options?: SensorOptions): ProximitySensor;
};

interface AmbientLightSensor extends AmbientSensor {
  readonly illuminance: number;
}

declare var AmbientLightSensor: {
  prototype: AmbientLightSensor;
  new (options?: SensorOptions): AmbientLightSensor;
};
