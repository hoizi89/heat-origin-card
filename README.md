# Heat Origin

A heat pump card for Home Assistant. Where the heat comes from, where it goes, and how the day went. The sister card to [Power Origin](https://github.com/hoizi89/power-origin-card).

- **Origin (default since 2.0)** — the card reads top to bottom. At the top the electricity (and where it comes from: sun, battery, grid) and the ambient heat flow into a ring that adds them up: electricity on the left where its line arrives, ambient heat on the right, each arc as long as its share. In the middle the hot water store and the buffer stand upright, each in two clear colours split exactly where its water stops being usable, both temperatures at the height of their sensor. Hot water reads as litres of shower water at 38 °C, the buffer as usable kWh with the card's learned forecast under it ("full ≈ 13:40" while charging on the sun, "until ≈ 04:35" while it carries the house). At the bottom the day — electricity, performance factor, hours of heating and hot water, starts — and one line per circuit: green while its flow meets its target, orange with the deviation, grey with "off since". Tap a store, a circuit or the ring for its history.
- **Classic (`layout: classic`)** — the drawing every 1.x version showed. The heat pump heads the left column with the hot water store under it; the heating group — the buffer, then the circuits it feeds — owns the right one, hung on one upright. Every box carries a symbol for what it is and the storey it serves, a heading over each figure, and a foot of its own: the store's level between empty and full with its set-points named at their notches, the circuit's room against the room it was asked for, flow and return beside it. Around the heat pump runs the day as a dial — midnight at the bottom, noon at the top, the hours of daylight arcing over it — and inside that, while it runs, the shares of ambient heat and electricity. Standing still, the centre tells what the heat pump did last and for how long and the foot the day's starts, running time and performance factor. In a column narrower than 300 px the takers become a list.
- **The buffer as a source** — when the heat pump is not heating and a circuit is still taking heat, that heat comes out of the buffer, and the card says so: the upright lights up from the buffer down, the chip names the circuits it carries and how much longer it can, and the foot the power being drawn — all worked out from the buffer's own measured fall rather than from a heat load nobody has. The same measurement says which way each store is going and when hot water will reach its Eco mark.
- **Compact** — one row: the state, the temperature that matters in it, and today as a thin band.

Everything shown is measured. Set-points are entered as numbers in the card, because many integrations report them wrongly.

## Install

Until the card is in HACS, add this repository as a custom repository of type *Dashboard*, or copy `dist/heat-origin-card.js` to `/config/www/heat-origin-card/` and add `/local/heat-origin-card/heat-origin-card.js` as a JavaScript module resource.

## Configuration

Only `entities.mode` is required. The card reads the rest of what it can out of what is already there: a circuit named "FBH EG" gets the underfloor symbol and the mark EG, "Heizkörper OG" a radiator and OG, and a buffer measures itself against the flow of the warmest circuit it is feeding instead of a fixed number that is wrong in September and wrong again in January.

The visual editor offers a choice with three or more looks as a short list of what each looks like, and one with two as a switch. Most choices only show in one situation — while the heat pump runs, while it stands, while the buffer carries the house — and the helper under each says which. Every circuit and store gets a group of its own there, with its sensors, litres, set-points and symbol, and each list ends in an empty group to add another; extra figures and state words are set in YAML.

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
    curve_flow: sensor.lambdawp_hc1_target_temp_flow_line   # the target with the room taken into account, not the raw curve
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
| `circuits[].curve_flow` | | The flow the controller is asking for — its flow target with the room taken into account (Lambda: `target_temp_flow_line`), not the raw curve, which ignores a room that is already warm. A value of 5 °C or below counts as none: controllers write 0 for a circuit they have switched off. |
| `circuits[].icon`, `stores[].icon` | guessed | `floor`, `radiator`, `fancoil`, `pipe`, `water`, `buffer`, `loop`. |
| `circuits[].short`, `stores[].short` | guessed | The mark under the symbol, usually the storey. |
| `stores[].kind` | guessed from the name | `hot_water` or `buffer`. |
| `stores[].marks` | | `eco`, `target`, `pv`, `max` — each a number in °C or the id of the entity that reports it (Lambda: `boil1_target_high_temperature`); each is named at its notch on the level. |
| `stores[].volume` | | Litres; shows the usable heat in kWh and the power being drawn. |
| `stores[].usable_min` | 40 hot water; a buffer: what the warmest running circuit asks for (its `curve_flow`), else its flow, else 30 | Where the level reads empty. A number or an entity. |
| `stores[].usable_max` | the highest mark, else `usable_min` + 20 K (buffer) or + 12 K (hot water), stretched to the next five above the store's own temperature | Where the level reads full. A number or an entity — a controller's maximum buffer temperature (Lambda: `buff1_maximum_buffer_temp`) is the honest one. Both ends stand under the level and are named in the box's tooltip. |
| `stores[].circulation`, `circulation_pump` | | The circulation line's temperature and pump. Circulation draws from the hot water store and gives nothing back, so it belongs to that store rather than to a circuit of its own; a circuit named or marked as circulation is moved there. |
| `stores[].due_at` | `eco` | Which mark the measured cooling is counted down to. The line names that mark rather than promising a start: what the heat pump does when it gets there is its own business, and a surplus of sun may have it charge long before. |
| `forecast_min_slope` | `0.4` | Kelvin per hour; below this measured fall the card says nothing about how long a store lasts and draws no trend. |
| `layout` | `origin` | `origin`: sources on top, stores in the middle, rooms below (see above). `classic` or `columns`: the heat pump heads the left column with hot water under it, the heating group — the buffer, then its circuits — owns the right one. `split`: stores left, circuits right, the heat pump between them. The `flow.*` looks below apply to the classic layouts. |
| `stores[].top_height`, `bottom_height` | hot water 0.81 / 0.35, buffer 0.85 / 0.2 | Origin layout: where each sensor sits, as a share of the water column (0 bottom, 1 top). The temperatures are drawn at these heights, and the usable edge, the litres and the kWh are worked out along a straight line through both. |
| `stores[].usable` | `liters` | Origin layout, hot water: litres of shower water, or `kwh`. |
| `stores[].mix`, `cold` | 38, 10 | Origin layout, hot water: the shower temperature and the cold water it is mixed with. Every layer at least a kelvin over `mix` counts; the bottom five per cent is the cold inlet and counts for nothing. |
| `entities.hot_water_reason` | | Origin layout: an entity whose state says why the hot water set-point is what it is, e.g. an `input_text` an automation writes ("Midday sun -> 50 °C"). The part before ` -> ` is shown under the target. |
| `entities.legionella_days` | | Origin layout: days since the hot water was last held at 60 °C. A badge says when that was: green under 5 days, orange from 5, red from 10. |
| `entities.legionella_last` | | Origin layout: when the hot water was last held at 60 °C (an `input_datetime` or timestamp). With it the badge counts calendar days. While a disinfection runs it says so. |
| `flow.on_target` | `0.5` | Origin layout: kelvin a running circuit's flow may be off its `curve_flow` and still count as on target. |
| `wide_from` | `560` | Card width in pixels from which the drawing spreads out — stores left, the heat pump between, circuits right, every box as wide as the columns' and the circle as large — instead of the two columns simply scaling up; the drawing stops growing at 760 px. `0` never. |
| `flow.centre` | `heat` | What the circle reads while the heat pump runs: `power`, or `both` — then the performance factor moves into the foot. |
| `flow.ring` | `sun` | The day's dial with the hours of daylight arcing over it; `plain` without them; `shares` no dial. While it runs, the shares of ambient heat and electricity ring the circle in any case. |
| `flow.labels` | `short` | Symbol with the storey under it; `icon` for the symbol alone, `name` for the name. |
| `flow.circuit` | `room` | The room with its target, flow and return beside them; `room_plain` leaves the target off; `flow` puts the flow first. |
| `flow.curve` | `false` | A resting circuit shows its room and the room's target alone — its flow and return are standing water. With this it also shows its flow and, beside it, what the heating curve wants of it. |
| `flow.gauge` | `zones` | The store's level as stages: the stretch below the first set-point, then one per set-point, each filling on its own, so what the eye reads is which stage the store has reached rather than a percentage. `scale` draws a thermometer — the bar as the scale itself, cold to warm, with a pointer on the temperature. `bar` is a plain filling bar, `box` fills the whole box; the bar and its row are gone, so the figures step up a size. Every gauge with numbers on its ends rounds them to the nearest 5 °C; the stages carry names and keep the exact ends. |
| `flow.scale` | `true` | The scale's ends written under the level (`scale`, `bar`, `box`); the stages name themselves instead. |
| `flow.trend` | `rate` | Which way a store is going, read off the last hour: arrow with the K/h where it fits, `arrow` alone, or `none`. Under 0.15 K/h the arrow lies flat — the store is holding. The forecast beside it keeps reading the last twenty minutes, so a shower shows up at once. |
| `flow.rest_colour` | `true` | A resting box keeps its symbol in its own colour instead of greying out with its state. |
| `flow.buffer_line` | `range` | While the buffer carries the circuits alone: the line with how long it can keep going; `line` alone; `none` draws nothing. |
| `flow.running` | `pair` | A running circuit's box. Above the figure stands what it does and since when — "HEIZT · 21:40" — and the room's target, which only explains why a circuit rests, is left out. `pair`: flow and the curve's flow target right, return and spread under. `quiet`: the same with nothing under. `headline`: the flow target as the word above, flow and return right. `flow`: the flow as the figure, the room beside it, the flow target under. `stack`: flow, flow target and return in three rows. `spread`: flow, spread and flow target in three rows. Return and spread are in the tooltip whichever. |
| `flow.store_head` | `left` | What a discharging store writes above its figure: `word` says discharging; `left` how long it can keep this up, from its measured fall — "≈ another 4 h 10", or "a day or more" — and the word while the fall is too slow to measure; `draw` the power going out and where to, "0.2 kW → EG". |
| *(learned set-points)* | | Where a store's charges end, learned from the same seven days: each charge the heat pump finished on its own (standing idle afterwards, not taken over by another run or a block) leaves its peak, peaks within 1,5 K are one set-point, and one seen twice counts. Named against the store's `marks.target` where there is one — below it Eco, above it PV — else the highest is Max. A set-point that a lower one has replaced twice since is forgotten. Anything written under `marks` or `usable_max` wins; only the gaps are learned. |
| *(learned)* | | A buffer learns from the last seven days of its own history — the heat pump's modes and the recorder's five-minute means of the buffer's two temperatures — where the heat pump starts again (against the heating curve's flow target) and how fast the house empties it. Once it has seen three starts and two whole discharges, empty on the scale is that start temperature, and a buffer carrying the house says when the heat pump will have to start: "bis ≈ 08:10", counted from its last full charge. Not from the fall of its top sensor: in a layered buffer the bottom sensor drops first and the top one hours later, then twenty kelvin in one hour. `usable_min` still overrides. |
| `flow.rest_note` | `last` | Under a resting circuit's room. `last`: when it last heated — "zuletzt 06:40 · vor 2 h", "zuletzt gestern 22:10", "zuletzt vor 3 Tagen" — read from the recorder up to seven days back. `target`: the room's target and how far off, which needs `target_room`. `none`: nothing. A circuit switched off for the summer is nowhere near its target and is not meant to be, so `last` is the default; `circuit: room_plain` from earlier versions reads as `none`. |
| `show_title` | `true` | The card's own title. Off where the dashboard names the section already: the head then reads "☀ PV-Betrieb · seit 10:02" while the heat pump runs on the sun (the time from today's history of `entities.pv_mode`), and nothing when there is no news. |
| `entities.pv_mode` | | Whether the heat pump runs on surplus solar: a switch or binary sensor that is on, or the surplus power it is sent — for Lambda `sensor.…_emgr_power_consumption_setpoint`, the power the heat pump itself asks of the sun (nought at night, 1.5 kW and up by day, held through clouds by the heat pump) — from `pv_mode_above` kW (1.5). A bare export figure measured after the heat pump's own draw needs `pv_mode_own: true`: the draw is added back and short dips are held for ten minutes. Then a small sun and PV stand by the title, once for the whole plant, and a running circuit's flow target reads PV target in the sun's colour, since that is the target the surplus has raised. |
| *(foot while running)* | | Three named columns — electricity with its source, ambient heat with the outdoor temperature, the heat pump's flow → return with spread and volume flow — and under them whatever else `foot_items` keeps. |
| *(charging buffer)* | | A buffer charging on the sun says when it will be full, "lädt · voll ≈ 16:40", from its climb over the last twenty minutes up to its learned top; off the sun the heat pump stops at a point the card does not know, so it gives no time. No trend arrow beside a store that charges: the word says it. |
| `flow.chips` | `true` | The badges in the head: what the heat pump does and since when, and a buffer carrying the house. The circle and the boxes say the same, so they can go. |
| `flow.foot_items` | all | The parts of the line under the drawing, picked one by one: `power` (electricity and its source), `ambient` (ambient heat; the outdoor temperature at rest), `buffer` (power drawn from the buffer), `due` (when hot water is due), `pump` (the heat pump's flow, return and spread), `volume` (volume flow), `day` (the day's figures at rest), `extras`. An empty list is no line. |
| `flow.foot` | `full` | The earlier word for the same, still read where `foot_items` is not written: `no_spread` leaves flow, return and spread out, `drive` keeps only electricity and ambient heat, `none` nothing. |
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
