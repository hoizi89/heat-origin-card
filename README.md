# Heat Origin

A heat pump card for Home Assistant. Where the heat comes from, where it goes, and how the day went. The sister card to [Power Origin](https://github.com/hoizi89/power-origin-card).

- **Heat flow** — one drawing. The heat pump heads the left column with the hot water store under it; the heating group — the buffer, then the circuits it feeds — owns the right one, hung on one upright. Every box carries a symbol for what it is and the storey it serves, a heading over each figure, and a foot of its own: the store's level between empty and full with its set-points named at their notches, the circuit's room against the room it was asked for, flow and return beside it. Around the heat pump runs the day as a dial — midnight at the bottom, noon at the top, the hours of daylight arcing over it — and inside that, while it runs, the shares of ambient heat and electricity. Standing still, the centre tells the last run and the foot the day's starts, running time and performance factor. In a column narrower than 340 px the takers become a list.
- **The buffer as a source** — when the heat pump is not heating and a circuit is still taking heat, that heat comes out of the buffer, and the card says so: the upright lights up from the buffer down, the chip names the circuits it carries and how much longer it can, and the foot the power being drawn — all worked out from the buffer's own measured fall rather than from a heat load nobody has. The same measurement says which way each store is going and when hot water will reach its Eco mark.
- **Compact** — one row: the state, the temperature that matters in it, and today as a thin band.

Everything shown is measured. Set-points are entered as numbers in the card, because many integrations report them wrongly.

## Install

Until the card is in HACS, add this repository as a custom repository of type *Dashboard*, or copy `dist/heat-origin-card.js` to `/config/www/heat-origin-card/` and add `/local/heat-origin-card/heat-origin-card.js` as a JavaScript module resource.

## Configuration

Only `entities.mode` is required. The card reads the rest of what it can out of what is already there: a circuit named "FBH EG" gets the underfloor symbol and the mark EG, "Heizkörper OG" a radiator and OG, and a buffer measures itself against the flow of the warmest circuit it is feeding instead of a fixed number that is wrong in September and wrong again in January.

The visual editor offers a choice with three or more looks as a short list of what each looks like, and one with two as a switch. Most choices only show in one situation — while the heat pump runs, while it stands, while the buffer carries the house — and the helper under each says which. Every circuit and store in the card gets a group of its own there, with its sensors, litres, set-points and symbol; adding or removing one, extra figures and state words are done in YAML.

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
circuits:
  - name: Underfloor
    state: sensor.lambdawp_hc1_operating_state
    flow: sensor.lambdawp_hc1_flow_line_temperature
    return: sensor.lambdawp_hc1_return_line_temperature
    room: sensor.lambdawp_hc1_room_device_temperature
    target_room: sensor.lambdawp_hc1_target_room_temperature
    curve_flow: sensor.lambdawp_hc1_heating_curve_flow_line_temperature_calc
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
  extras:
    - entity: sensor.lambdawp_hp1_hot_gas_temperature
      name: Hot gas
```

### Options

| Option | Default | |
|---|---|---|
| `title` | Heating | |
| `source` | `air` | `ground` or `water`: names the ambient heat in the flow. |
| `shape` | `standard` | `compact` is one row. |
| `font` | `system` | Figures in the dashboard font with equal-width digits; `mono` for monospace. |
| `entities.house_power`, `grid_power`, `battery_power` | | Split the electricity by source; `grid_invert`, `battery_invert` flip the signs. Without them, PV at or above the draw counts as PV. |
| `entities.cop` | | A live COP sensor; otherwise heat divided by electricity. |
| `entities.heating_heat_today` … `hot_water_electric_today` | | The day's heat and electricity per mode, for the day's performance factor in the foot. |
| `entities.heat_today`, `electric_today` | | Totals, for heat pumps that do not split by mode. |
| `circuits[].active` | HEATING, ECO, COOLING, … | Words of the circuit's state that mean it takes heat. |
| `circuits[].pump` | | A switch or binary sensor; on means the circuit runs. |
| `circuits[].temperature` | | One temperature, for loops without flow and return. |
| `circuits[].target_room` | | The room the circuit was asked for. A room reading is neither good nor bad until something says what was wanted there, so with this the figure becomes an answer and its distance from the target is written under it. |
| `circuits[].curve_flow` | | What the heating curve is asking of the circuit. While a circuit rests its return line is a number with nothing behind it, so this takes that place instead. |
| `circuits[].icon`, `stores[].icon` | guessed | `floor`, `radiator`, `fancoil`, `pipe`, `water`, `buffer`, `loop`. |
| `circuits[].short`, `stores[].short` | guessed | The mark under the symbol, usually the storey. |
| `stores[].kind` | guessed from the name | `hot_water` or `buffer`. |
| `stores[].marks` | | `eco`, `target`, `pv`, `max` as numbers; each is named at its notch on the level. |
| `stores[].volume` | | Litres; shows the usable heat in kWh and the power being drawn. |
| `stores[].usable_min` | 40 hot water; a buffer: the warmest running circuit's flow, else 30 | Where the level reads empty. |
| `stores[].usable_max` | the highest mark, else `usable_min` + 20 K (buffer) or + 12 K (hot water), stretched to the next five above the store's own temperature | Where the level reads full. Both ends stand under the level and are named in the box's tooltip. |
| `stores[].circulation`, `circulation_pump` | | The circulation line's temperature and pump. Circulation draws from the hot water store and gives nothing back, so it belongs to that store rather than to a circuit of its own; a circuit named or marked as circulation is moved there. |
| `stores[].due_at` | `eco` | Which mark the measured cooling is counted down to. The line names that mark rather than promising a start: what the heat pump does when it gets there is its own business, and a surplus of sun may have it charge long before. |
| `forecast_min_slope` | `0.4` | Kelvin per hour; below this measured fall the card says nothing about how long a store lasts and draws no trend. |
| `layout` | `columns` | `columns`: the heat pump heads the left column with hot water under it, the heating group — the buffer, then its circuits — owns the right one. `split`: stores left, circuits right, the heat pump between them. |
| `flow.centre` | `heat` | What the circle reads while the heat pump runs: `power`, or `both` — then the performance factor moves into the foot. |
| `flow.ring` | `sun` | The day's dial with the hours of daylight arcing over it; `plain` without them; `shares` no dial. While it runs, the shares of ambient heat and electricity ring the circle in any case. |
| `flow.labels` | `short` | Symbol with the storey under it; `icon` for the symbol alone, `name` for the name. |
| `flow.circuit` | `room` | The room with its target, flow and return beside them; `room_plain` leaves the target off; `flow` puts the flow first. |
| `flow.curve` | `false` | A resting circuit shows its room and the room's target alone — its flow and return are standing water. With this it also shows its flow and, beside it, what the heating curve wants of it. |
| `flow.gauge` | `zones` | The store's level as stages: the stretch below the first set-point, then one per set-point, each filling on its own, so what the eye reads is which stage the store has reached rather than a percentage. `scale` draws a thermometer — the bar as the scale itself, cold to warm, with a pointer on the temperature. `bar` is a plain filling bar, `box` fills the whole box. |
| `flow.scale` | `true` | The scale's ends written under the level (`scale`, `bar`, `box`); the stages name themselves instead. |
| `flow.trend` | `rate` | Which way a store is going, read off the last hour: arrow with the K/h where it fits, `arrow` alone, or `none`. Under 0.15 K/h the arrow lies flat — the store is holding. The forecast beside it keeps reading the last twenty minutes, so a shower shows up at once. |
| `flow.rest_colour` | `true` | A resting box keeps its symbol in its own colour instead of greying out with its state. |
| `flow.buffer_line` | `range` | While the buffer carries the circuits alone: the line with how long it can keep going; `line` alone; `named` also writes "from the buffer" in the circuit's box; `none` draws nothing. |
| `flow.foot` | `full` | The line under the drawing; `no_spread` leaves flow, return and spread out, `drive` keeps only electricity and ambient heat, `none` nothing. |
| `flow.balance` | `true` | While the heat pump stands: the day's starts, running time and performance factor in place of the last run, which the circle tells anyway. |
| `flow.extras` | | Further figures in the foot, `{ entity, name, running_only }`; `running_only` hides a figure at rest, e.g. hot gas. |

What earlier versions wrote — `spread`, `sun`, `target`, `bypass`, `range`, `origin`, `detail`, the `sections` and `day` blocks, and 1.0.0's `resting`, `dial`, `idle_foot` and `rest` — is still read and lands on what it meant; the editor writes the current keys from then on.

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
