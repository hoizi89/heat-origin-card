# Heat Origin

A heat pump card for Home Assistant. Where the heat comes from, where it goes, and how the day went. The sister card to [Power Origin](https://github.com/hoizi89/power-origin-card).

- **Heat flow** — the heat pump in the middle, the stores on its left and the heating circuits on its right; electricity and ambient heat stand as one line each above and below it. Line widths follow the kilowatts; the electricity wears the colour of its source as in Power Origin (sun, battery, grid), the ambient heat is green, and the ring shows both shares. Circuits show their own state, room temperature and, optionally, flow, return and spread. A running circulation pump puts a small loop mark on the hot water. Standing still, the centre tells the last run. In a column narrower than 340 px the takers become a list.
- **Day band** — yesterday and today as 24-hour bands coloured by what the heat pump did, with PV power above. Starts, short runs and running time are counted from the history; hover a short-run marker for its time. Under the running times of heating and hot water stands the day's performance factor next to the month's, with a small arrow where they part by half a point or more. A notice appears only when the heat pump cycles.
- **Storage** — each store's temperature first, the tank drawn as its layering between the sensors, the set-points you enter as marks, and with the volume the usable heat in kWh.
- **Compact** — one row: the state, the temperature that matters in it, and today as a thin band.

Everything shown is measured. Set-points are entered as numbers in the card, because many integrations report them wrongly.

## Install

Until the card is in HACS, add this repository as a custom repository of type *Dashboard*, or copy `dist/heat-origin-card.js` to `/config/www/heat-origin-card/` and add `/local/heat-origin-card/heat-origin-card.js` as a JavaScript module resource.

## Configuration

Only `entities.mode` is required. The visual editor covers the sensors and switches; circuits, stores, extra figures and state words are set in YAML.

```yaml
type: custom:heat-origin-card
entities:
  mode: sensor.lambdawp_hp1_operating_state
  heat_power: sensor.lambdawp_hp1_actual_heating_capacity
  electric_power: sensor.lambdawp_hp1_inverter_power_consumption
  flow: sensor.lambdawp_hp1_flow_line_temperature
  return: sensor.lambdawp_hp1_return_line_temperature
  volume_flow: sensor.lambdawp_hp1_volume_flow_heat_sink
  outdoor: sensor.lambdawp_ambient_temperature
  solar: sensor.pv_power
  house_power: sensor.house_consumption   # optional: split the electricity by source
  grid_power: sensor.grid_power           # + import
  battery_power: sensor.battery_power     # + discharge
  heating_heat_today: sensor.lambdawp_hp1_heating_thermal_energy_daily
  heating_electric_today: sensor.lambdawp_hp1_heating_energy_daily
  hot_water_heat_today: sensor.lambdawp_hp1_hot_water_thermal_energy_daily
  hot_water_electric_today: sensor.lambdawp_hp1_hot_water_energy_daily
  cop_heating_year: sensor.lambdawp_hp1_heating_cop_yearly
  cop_hot_water_year: sensor.lambdawp_hp1_hot_water_cop_yearly
circuits:
  - name: Underfloor
    state: sensor.lambdawp_hc1_operating_state
    flow: sensor.lambdawp_hc1_flow_line_temperature
    return: sensor.lambdawp_hc1_return_line_temperature
    room: sensor.lambdawp_hc1_room_device_temperature
stores:
  - name: Hot water
    top: sensor.lambdawp_boil1_actual_high_temperature
    bottom: sensor.lambdawp_boil1_actual_low_temperature
    marks: { eco: 44.5, target: 48.5, pv: 57.5 }
    volume: 300
    circulation: sensor.lambdawp_boil1_actual_circulation_temperature
    circulation_pump: switch.circulation_pump
  - name: Buffer
    kind: buffer
    top: sensor.lambdawp_buff1_actual_high_temperature
    bottom: sensor.lambdawp_buff1_actual_low_temperature
    volume: 300
flow:
  spread: true
  circuit_details: true
  extras:
    - entity: sensor.lambdawp_hp1_hot_gas_temperature
      name: Hot gas
```

### Options

| Option | Default | |
|---|---|---|
| `title` | Heating | |
| `source` | `air` | `ground` or `water`: names the ambient heat in the flow. |
| `entities.house_power`, `grid_power`, `battery_power` | | Split the electricity by source; `grid_invert`, `battery_invert` flip the signs. Without them, PV at or above the draw counts as PV. |
| `shape` | `standard` | `compact` is one row. |
| `font` | `system` | Figures in the dashboard font with equal-width digits; `mono` for monospace. |
| `sections.flow` / `day` / `stores` | on, stores only with stores | `sections.order` sets the order. |
| `entities.cop` | | A live COP sensor; otherwise heat divided by electricity. |
| `entities.heating_heat_today` … `hot_water_electric_today` | | The day's heat and electricity per mode, for today's performance factor. |
| `entities.heat_today`, `electric_today` | | Totals, for heat pumps that do not split by mode; one factor under the starts. |
| `entities.cop_heating_month` … `cop_hot_water_year` | | Compared with today's factor; the year stands in where no month is given. |
| `circuits[].active` | HEATING, ECO, COOLING, … | Words of the circuit's state that mean it takes heat. |
| `stores[].circulation`, `circulation_pump` | | The circulation line's temperature and pump. Circulation draws from the hot water store, so it shows there and as a small mark on the hot water in the flow, not as a circuit. A circuit named or marked as circulation is moved to the hot water store. |
| `circuits[].pump` | | A switch or binary sensor; on means the circuit runs. |
| `circuits[].temperature` | | One temperature, for loops without flow and return. |
| `stores[].volume` | | Litres; shows the usable heat in kWh. |
| `stores[].usable_min` | 40 hot water, 30 buffer | °C below which the heat counts as not usable. |
| `stores[].kind` | guessed from the name | `hot_water` or `buffer`. |
| `stores[].marks` | | `eco`, `target`, `pv`, `max` as numbers. |
| `flow.layout` | `split` | `split`: stores left, circuits right, sources above and below the heat pump. `stacked`: sources left, every taker right. With a single taker the drawing is always stacked. |
| `flow.spread` | `true` | Flow, return, spread and volume under the drawing. |
| `flow.circuit_details` | `false` | Flow, return and spread inside each circuit. |
| `flow.extras` | | Further figures, `{ entity, name, running_only }`; `running_only` hides a figure at rest, e.g. hot gas. |
| `day.days` | `2` | `1` shows today only. |
| `day.short_run` | `120` | Seconds; shorter runs are flagged. `0` turns it off. |
| `day.cycling_from` | `3` | Short runs in a day from which a notice appears. |

### State words

The card knows four activities: heating, hot water, cooling and defrost, plus blocked. Lambda's words (`CH`, `DHW`, `CC`, `DEFROST`, `TIME-BLOCK` …) and plain English and German ones work out of the box. Other integrations add theirs:

```yaml
modes:
  heating: [Heizbetrieb]
  hot_water: [Warmwasserbereitung]
  ignore: [Meldung]   # passing words that interrupt nothing
```

`INFO-MESSAGE`, `unknown` and `unavailable` are ignored by default: the state before them carries on.

### Colours

`--heat-origin-heating-color`, `--heat-origin-hot-water-color`, `--heat-origin-cooling-color`, `--heat-origin-defrost-color`, `--heat-origin-air-color`, `--heat-origin-power-color`, `--heat-origin-sun-color`.

## Develop

```bash
npm install
npm run check          # tests, types, build
node tools/preview.mjs # tools/preview.html with a real Lambda day
```

MIT licence.
