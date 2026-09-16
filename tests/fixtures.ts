import type { HassEntity, HeatOriginCardConfig, HomeAssistant } from "../src/types";

const at = (day: number, h: number, m: number, s = 0) => new Date(2026, 8, day, h, m, s).getTime() / 1000;

/** The operating state as the recorder kept it, 14 and 15 September 2026. */
export const HISTORY: Array<[string, number]> = [
  ["STBY", at(14, 0, 0)],
  ["CH", at(14, 7, 52, 8)],
  ["DHW", at(14, 8, 43, 38)],
  ["STBY", at(14, 9, 16, 28)],
  ["TIME-BLOCK", at(14, 9, 18, 8)],
  ["STBY", at(14, 9, 37, 38)],
  ["CH", at(14, 10, 24, 8)],
  ["STBY", at(14, 12, 24, 56)],
  ["TIME-BLOCK", at(14, 12, 26, 9)],
  ["STBY", at(14, 12, 45, 56)],
  ["DHW", at(14, 13, 0, 9)],
  ["STBY", at(14, 14, 10, 55)],
  ["TIME-BLOCK", at(14, 14, 11, 8)],
  ["STBY", at(14, 14, 30, 39)],
  ["CH", at(14, 15, 43, 7)],
  ["STBY", at(14, 15, 43, 37)],
  ["unknown", at(14, 18, 7, 50)],
  ["STBY", at(14, 18, 8, 7)],
  ["DHW", at(15, 8, 4, 22)],
  ["CH", at(15, 9, 23, 22)],
  ["TIME-BLOCK", at(15, 9, 40, 34)],
  ["CH", at(15, 10, 0, 22)],
  ["STBY", at(15, 11, 58, 58)],
  ["TIME-BLOCK", at(15, 12, 0, 14)],
  ["STBY", at(15, 12, 19, 59)],
  ["DHW", at(15, 13, 0, 13)]
];

export const historyResponse = (entityId: string) => ({
  [entityId]: HISTORY.map(([s, lu]) => ({ s, lu }))
});

const hourMs = (day: number, h: number) => new Date(2026, 8, day, h, 0, 0).getTime();
const PV_14 = [0, 0, 0, 0, 0, 0, 37, 137, 290, 908, 3748, 7232, 7891, 3213, 4292, 2982, 2152, 3103, 1102, 60, 3, 0, 0, 0];
const PV_15 = [0, 0, 0, 0, 0, 0, 59, 636, 3510, 5453, 7209, 8404, 8975];

export const statisticsResponse = (entityId: string) => ({
  [entityId]: [
    ...PV_14.map((mean, h) => ({ start: hourMs(14, h), mean })),
    ...PV_15.map((mean, h) => ({ start: hourMs(15, h), mean }))
  ]
});

const entity = (entity_id: string, state: string | number, unit = "", extra: Partial<HassEntity> = {}): HassEntity => ({
  entity_id,
  state: String(state),
  attributes: { unit_of_measurement: unit },
  ...extra
});

export const IDS = {
  mode: "sensor.lambdawp_hp1_operating_state",
  heat_power: "sensor.lambdawp_hp1_actual_heating_capacity",
  electric_power: "sensor.lambdawp_hp1_inverter_power_consumption",
  flow: "sensor.lambdawp_hp1_flow_line_temperature",
  return: "sensor.lambdawp_hp1_return_line_temperature",
  volume_flow: "sensor.lambdawp_hp1_volume_flow_heat_sink",
  outdoor: "sensor.lambdawp_ambient_temperature",
  solar: "sensor.pv_power",
  house_power: "sensor.house_consumption",
  grid_power: "sensor.grid_power_inverted",
  battery_power: "sensor.battery_power",
  heating_heat_today: "sensor.lambdawp_hp1_heating_thermal_energy_daily",
  heating_electric_today: "sensor.lambdawp_hp1_heating_energy_daily",
  hot_water_heat_today: "sensor.lambdawp_hp1_hot_water_thermal_energy_daily",
  hot_water_electric_today: "sensor.lambdawp_hp1_hot_water_energy_daily"
};

export function states(mode = "DHW"): Record<string, HassEntity> {
  const list: HassEntity[] = [
    entity(IDS.mode, mode, "", { last_changed: new Date(2026, 8, 15, 13, 0, 13).toISOString() }),
    entity(IDS.heat_power, 6.6, "kW"),
    entity(IDS.electric_power, 1725, "W"),
    entity(IDS.flow, 67.15, "°C"),
    entity(IDS.return, 63.92, "°C"),
    entity(IDS.volume_flow, 1752, "l/h"),
    entity(IDS.outdoor, 20.2, "°C"),
    entity(IDS.solar, 8975, "W"),
    entity(IDS.house_power, 2700, "W"),
    entity(IDS.grid_power, -6300, "W"),
    entity(IDS.battery_power, -40, "W"),
    entity("switch.zirkulationspumpe", "on"),
    entity(IDS.heating_heat_today, 15.14, "kWh"),
    entity(IDS.heating_electric_today, 2.44, "kWh"),
    entity(IDS.hot_water_heat_today, 12.5, "kWh"),
    entity(IDS.hot_water_electric_today, 3.05, "kWh"),
    entity("sensor.lambdawp_boil1_actual_high_temperature", 57.6, "°C"),
    entity("sensor.lambdawp_boil1_actual_low_temperature", 57.6, "°C"),
    entity("sensor.lambdawp_boil1_actual_circulation_temperature", 34.3, "°C"),
    entity("sensor.lambdawp_buff1_actual_high_temperature", 55.2, "°C"),
    entity("sensor.lambdawp_buff1_actual_low_temperature", 51.7, "°C"),
    entity("sensor.lambdawp_hc1_operating_state", "CH-SUMMER"),
    entity("sensor.lambdawp_hc1_flow_line_temperature", 25.8, "°C"),
    entity("sensor.lambdawp_hc1_return_line_temperature", 24.7, "°C"),
    entity("sensor.lambdawp_hc1_room_device_temperature", 24.5, "°C"),
    entity("sensor.lambdawp_hc1_target_room_temperature", 22.5, "°C"),
    entity("sensor.lambdawp_hc1_heating_curve_flow_line_temperature_calc", 30.6, "°C"),
    entity("sensor.lambdawp_hc2_operating_state", "OFF"),
    entity("sensor.lambdawp_hc2_flow_line_temperature", 25.8, "°C"),
    entity("sensor.lambdawp_hc2_return_line_temperature", 23.4, "°C"),
    entity("sensor.lambdawp_hc2_room_device_temperature", 24.8, "°C"),
    entity("sensor.lambdawp_hp1_hot_gas_temperature", 87.46, "°C")
  ];
  return Object.fromEntries(list.map((e) => [e.entity_id, e]));
}

export function makeHass(overrides: Record<string, HassEntity> = {}, language = "de"): HomeAssistant & { calls: string[] } {
  const calls: string[] = [];
  return {
    states: { ...states(), ...overrides },
    locale: { language },
    calls,
    async callWS<T>(message: Record<string, unknown>): Promise<T> {
      calls.push(String(message.type));
      if (message.type === "history/history_during_period") return historyResponse(IDS.mode) as T;
      if (message.type === "recorder/statistics_during_period") return statisticsResponse(IDS.solar) as T;
      return {} as T;
    }
  };
}

export const FULL_CONFIG: HeatOriginCardConfig = {
  type: "custom:heat-origin-card",
  entities: { ...IDS },
  circuits: [
    {
      name: "FBH EG",
      state: "sensor.lambdawp_hc1_operating_state",
      flow: "sensor.lambdawp_hc1_flow_line_temperature",
      return: "sensor.lambdawp_hc1_return_line_temperature",
      room: "sensor.lambdawp_hc1_room_device_temperature",
      target_room: "sensor.lambdawp_hc1_target_room_temperature",
      curve_flow: "sensor.lambdawp_hc1_heating_curve_flow_line_temperature_calc"
    },
    {
      name: "Heizkörper OG",
      state: "sensor.lambdawp_hc2_operating_state",
      flow: "sensor.lambdawp_hc2_flow_line_temperature",
      return: "sensor.lambdawp_hc2_return_line_temperature",
      room: "sensor.lambdawp_hc2_room_device_temperature"
    }
  ],
  stores: [
    {
      name: "Warmwasser",
      top: "sensor.lambdawp_boil1_actual_high_temperature",
      bottom: "sensor.lambdawp_boil1_actual_low_temperature",
      marks: { eco: 44.5, target: 48.5, pv: 57.5 },
      volume: 300,
      circulation: "sensor.lambdawp_boil1_actual_circulation_temperature",
      circulation_pump: "switch.zirkulationspumpe"
    },
    {
      name: "Puffer",
      top: "sensor.lambdawp_buff1_actual_high_temperature",
      bottom: "sensor.lambdawp_buff1_actual_low_temperature",
      volume: 300
    }
  ],
  flow: { extras: [{ entity: "sensor.lambdawp_hp1_hot_gas_temperature", name: "Heißgas", running_only: true }] }
};
