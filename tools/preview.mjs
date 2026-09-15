import fs from "node:fs";

/* Writes tools/preview.html: the built card on the real afternoon of
   15 September 2026, dark and light, full and compact. Chrome takes it:
   chrome --headless=new --window-size=1320,1500 --screenshot=docs/card.png tools/preview.html */

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const bundle = fs.readFileSync(here + "../dist/heat-origin-card.js", "utf8");

const harness = `
const REAL_NOW = new Date(2026, 8, 15, 13, 40, 0).getTime();
const offset = REAL_NOW - Date.now();
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
  static now() { return RealDate.now() + offset; }
};
const at = (d, h, m, s = 0) => new RealDate(2026, 8, d, h, m, s).getTime() / 1000;
const HISTORY = [["STBY",at(14,0,0)],["CH",at(14,7,52,8)],["DHW",at(14,8,43,38)],["STBY",at(14,9,16,28)],["TIME-BLOCK",at(14,9,18,8)],["STBY",at(14,9,37,38)],["CH",at(14,10,24,8)],["STBY",at(14,12,24,56)],["TIME-BLOCK",at(14,12,26,9)],["STBY",at(14,12,45,56)],["DHW",at(14,13,0,9)],["STBY",at(14,14,10,55)],["TIME-BLOCK",at(14,14,11,8)],["STBY",at(14,14,30,39)],["CH",at(14,15,43,7)],["STBY",at(14,15,43,37)],["STBY",at(14,18,8,7)],["DHW",at(15,8,4,22)],["CH",at(15,9,23,22)],["TIME-BLOCK",at(15,9,40,34)],["CH",at(15,10,0,22)],["STBY",at(15,11,58,58)],["TIME-BLOCK",at(15,12,0,14)],["STBY",at(15,12,19,59)],["DHW",at(15,13,0,13)]];
const PV = { 14: [0,0,0,0,0,0,37,137,290,908,3748,7232,7891,3213,4292,2982,2152,3103,1102,60,3,0,0,0], 15: [0,0,0,0,0,0,59,636,3510,5453,7209,8404,8975] };
const e = (id, state, unit = "") => [id, { entity_id: id, state: String(state), attributes: { unit_of_measurement: unit, friendly_name: id } }];
const states = Object.fromEntries([
  e("sensor.lambdawp_hp1_operating_state", "DHW"),
  e("sensor.lambdawp_hp1_actual_heating_capacity", 6.6, "kW"),
  e("sensor.lambdawp_hp1_inverter_power_consumption", 1725, "W"),
  e("sensor.lambdawp_hp1_flow_line_temperature", 67.15, "°C"),
  e("sensor.lambdawp_hp1_return_line_temperature", 63.92, "°C"),
  e("sensor.lambdawp_hp1_volume_flow_heat_sink", 1752, "l/h"),
  e("sensor.lambdawp_ambient_temperature", 20.2, "°C"),
  e("sensor.pv_power", 8975, "W"),
  e("sensor.house_consumption", 2700, "W"),
  e("sensor.grid_power_inverted", -6300, "W"),
  e("sensor.battery_power", -40, "W"),
  e("switch.zirkulationspumpe", "on"),
  e("sensor.lambdawp_hp1_heating_thermal_energy_daily", 15.14, "kWh"),
  e("sensor.lambdawp_hp1_heating_energy_daily", 2.44, "kWh"),
  e("sensor.lambdawp_hp1_hot_water_thermal_energy_daily", 12.5, "kWh"),
  e("sensor.lambdawp_hp1_hot_water_energy_daily", 3.05, "kWh"),
  e("sensor.lambdawp_hp1_heating_cop_yearly", 6.0),
  e("sensor.lambdawp_hp1_hot_water_cop_yearly", 4.42),
  e("sensor.lambdawp_boil1_actual_high_temperature", 57.6, "°C"),
  e("sensor.lambdawp_boil1_actual_low_temperature", 57.6, "°C"),
  e("sensor.lambdawp_boil1_actual_circulation_temperature", 34.3, "°C"),
  e("sensor.lambdawp_buff1_actual_high_temperature", 55.2, "°C"),
  e("sensor.lambdawp_buff1_actual_low_temperature", 51.7, "°C"),
  e("sensor.lambdawp_hc1_operating_state", "CH-SUMMER"),
  e("sensor.lambdawp_hc1_flow_line_temperature", 25.8, "°C"),
  e("sensor.lambdawp_hc1_return_line_temperature", 24.7, "°C"),
  e("sensor.lambdawp_hc1_room_device_temperature", 24.5, "°C"),
  e("sensor.lambdawp_hc2_operating_state", "OFF"),
  e("sensor.lambdawp_hc2_flow_line_temperature", 25.8, "°C"),
  e("sensor.lambdawp_hc2_return_line_temperature", 23.4, "°C"),
  e("sensor.lambdawp_hc2_room_device_temperature", 24.8, "°C"),
  e("sensor.lambdawp_hp1_hot_gas_temperature", 87.46, "°C")
]);
states["sensor.lambdawp_hp1_operating_state"].last_changed = new RealDate(2026, 8, 15, 13, 0, 13).toISOString();
const hass = {
  states, locale: { language: "de" },
  async callWS(m) {
    if (m.type === "history/history_during_period") return { "sensor.lambdawp_hp1_operating_state": HISTORY.map(([s, lu]) => ({ s, lu })) };
    if (m.type === "recorder/statistics_during_period") return { "sensor.pv_power": [14, 15].flatMap((d) => PV[d].map((mean, h) => ({ start: new RealDate(2026, 8, d, h).getTime(), mean }))) };
    return {};
  }
};
const config = {
  type: "custom:heat-origin-card",
  entities: {
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
    hot_water_electric_today: "sensor.lambdawp_hp1_hot_water_energy_daily",
    cop_heating_year: "sensor.lambdawp_hp1_heating_cop_yearly",
    cop_hot_water_year: "sensor.lambdawp_hp1_hot_water_cop_yearly"
  },
  circuits: [
    { name: "FBH EG", state: "sensor.lambdawp_hc1_operating_state", flow: "sensor.lambdawp_hc1_flow_line_temperature", return: "sensor.lambdawp_hc1_return_line_temperature", room: "sensor.lambdawp_hc1_room_device_temperature" },
    { name: "Heizkörper OG", state: "sensor.lambdawp_hc2_operating_state", flow: "sensor.lambdawp_hc2_flow_line_temperature", return: "sensor.lambdawp_hc2_return_line_temperature", room: "sensor.lambdawp_hc2_room_device_temperature" },
    { name: "Zirkulation", pump: "switch.zirkulationspumpe", temperature: "sensor.lambdawp_boil1_actual_circulation_temperature" }
  ],
  stores: [
    { name: "Warmwasser", top: "sensor.lambdawp_boil1_actual_high_temperature", bottom: "sensor.lambdawp_boil1_actual_low_temperature", marks: { eco: 44.5, target: 48.5, pv: 57.5 }, volume: 300 },
    { name: "Puffer", top: "sensor.lambdawp_buff1_actual_high_temperature", bottom: "sensor.lambdawp_buff1_actual_low_temperature", volume: 300 }
  ],
  flow: { circuit_details: true, extras: [{ entity: "sensor.lambdawp_hp1_hot_gas_temperature", name: "Heißgas" }] }
};
const idleStates = { ...states, "sensor.lambdawp_hp1_operating_state": { ...states["sensor.lambdawp_hp1_operating_state"], state: "STBY", last_changed: new RealDate(2026, 8, 15, 13, 39, 46).toISOString() }, "switch.zirkulationspumpe": { ...states["switch.zirkulationspumpe"], state: "off" } };
const idleHass = { ...hass, states: idleStates };
for (const [slot, extra, h] of [["dark", {}, hass], ["compact-dark", { shape: "compact" }, hass], ["light", {}, idleHass], ["narrow", {}, hass]]) {
  const el = document.createElement("heat-origin-card");
  el.setConfig({ ...config, ...extra });
  el.hass = h;
  document.getElementById(slot).append(el);
}
`;

const page = `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; padding: 16px; background: #0b0d14; font-family: Roboto, "Segoe UI", system-ui, sans-serif; display: flex; gap: 20px; align-items: flex-start; }
  .col { width: 410px; display: flex; flex-direction: column; gap: 16px; padding: 12px; border-radius: 12px; }
  .dark { background: #111318; --ha-card-background: #1c1c1e; --card-background-color: #1c1c1e; --primary-text-color: #e1e1e1; --secondary-text-color: #9b9b9b; --divider-color: #2f3137; color-scheme: dark; }
  .light { background: #f4f4f6; --ha-card-background: #fff; --card-background-color: #fff; --primary-text-color: #212121; --secondary-text-color: #727272; --divider-color: #e0e0e0; }
  ha-card { display: block; background: var(--ha-card-background); color: var(--primary-text-color); border-radius: 12px; }
</style>
<div class="col dark"><div id="dark"></div><div id="compact-dark"></div></div>
<div class="col light"><div id="light"></div></div>
<div class="col dark" style="width:290px"><div id="narrow"></div></div>
<script type="module">${bundle}</script>
<script type="module">${harness}</script>`;

fs.writeFileSync(here + "preview.html", page);
console.log("tools/preview.html");
