# Heat Origin

A heat pump card for Home Assistant. Where the heat comes from, where it goes, and how the day went. The sister card to [Power Origin](https://github.com/hoizi89/power-origin-card).

- **Heat flow** — the heat pump in the middle, the stores on its left and the heating circuits on its right. Every box carries a symbol for what it is and the storey it serves, a heading over each figure, and a foot of its own: the store's level, the circuit's return and spread. A store fills from its usable minimum to its highest mark, in two tones, so the paler part is the layering. Around the heat pump runs the day as a dial — midnight at the bottom, noon at the top, the hours of daylight arcing over it — and inside that the shares of ambient heat and electricity. Standing still, the centre tells the last run. In a column narrower than 340 px the takers become a list.
- **The buffer as a source** — when the heat pump is not heating and a circuit is still taking heat, that heat comes out of the buffer, and the card draws it: a line from the buffer, routed past the heat pump, with an arrow at the circuit it feeds and a manifold when it feeds two. On the line stands how much longer the buffer can carry them, worked out from its own measured fall rather than from a heat load nobody has. The same measurement says when hot water will be due again.
- **Day band** — yesterday and today as 24-hour bands coloured by what the heat pump did, with PV power above. Starts, short runs and running time are counted from the history; hover a short-run marker for its time. Under the running times of heating and hot water stands the day's performance factor next to the month's, with a small arrow where they part by half a point or more. A notice appears only when the heat pump cycles.
- **Storage** — a section that repeats the flow's own gauges, so it stays off while the flow is drawn. Switch the flow off, or ask for `sections.stores`, and each store gets its tank, its marks and its usable heat in full.
- **Compact** — one row: the state, the temperature that matters in it, and today as a thin band.

Everything shown is measured. Set-points are entered as numbers in the card, because many integrations report them wrongly.

## Install

Until the card is in HACS, add this repository as a custom repository of type *Dashboard*, or copy `dist/heat-origin-card.js` to `/config/www/heat-origin-card/` and add `/local/heat-origin-card/heat-origin-card.js` as a JavaScript module resource.

## Configuration

Only `entities.mode` is required. The card reads the rest of what it can out of what is already there: a circuit named "FBH EG" gets the underfloor symbol and the mark EG, "Heizkörper OG" a radiator and OG, and a buffer measures itself against the flow of the warmest circuit it is feeding instead of a fixed number that is wrong in September and wrong again in January.

The visual editor has two dials — **Detail** and what the middle of the circle reads — plus the sensors. Circuits, stores, extra figures and state words are set in YAML.

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
| `stores[].circulation`, `circulation_pump` | | The circulation line's temperature and pump. Circulation draws from the hot water store and gives nothing back, so it belongs to that store rather than to a circuit of its own: in a wide box it stands in the middle of the scale row, lit while the pump runs. A circuit named or marked as circulation is moved to the hot water store. |
| `circuits[].target_room` | | The room the circuit was asked for. A room reading is neither good nor bad until something says what was wanted there, so with this the figure becomes an answer and its distance from the target is written under it. |
| `circuits[].curve_flow` | | What the heating curve is asking of the circuit. While a circuit rests its return line is a number with nothing behind it, so this takes that place instead. |
| `circuits[].pump` | | A switch or binary sensor; on means the circuit runs. |
| `circuits[].temperature` | | One temperature, for loops without flow and return. |
| `stores[].volume` | | Litres; shows the usable heat in kWh. |
| `stores[].usable_min` | 40 hot water, the warmest running circuit's flow for a buffer | °C below which the heat counts as not usable. |
| `stores[].kind` | guessed from the name | `hot_water` or `buffer`. |
| `stores[].marks` | | `eco`, `target`, `pv`, `max` as numbers. |
| `flow.detail` | `normal` | `low` or `high`: moves labels, circuit face, store scale and foot line together. Every key below overrules it. |
| `flow.labels` | `short` | `icon` for the symbol alone, `name` for the name as before. |
| `flow.circuit` | `room` | The room as the figure, flow and return beside it as a pair. `flow` puts the flow first instead. |
| `flow.gauge` | `bar` | `box` fills the whole box instead of the bar in its foot. |
| `flow.ring` | `both` | `clock` for the day alone, `shares` for the split alone. |
| `flow.sun` | `true` | The hours of daylight as an arc outside the dial. |
| `flow.centre` | `heat` | `power`, or `both` — then the performance factor moves into the foot. |
| `flow.bypass` | `true` | Draw the buffer feeding the circuits. |
| `flow.range` | `true` | How long it can keep doing so, on the line itself. |
| `flow.origin` | off | Name the buffer in the circuit's box as well. |
| `flow.target` | `true` | The room a circuit was asked for, under the room it has. |
| `flow.curve` | `true` | What the heating curve wants of a resting circuit, in place of its return. |
| `flow.trend` | `true` | Which way a store is going — from the fall the card measures for its forecast anyway, so it costs nothing new. |
| `flow.balance` | `true` | The day's starts, running time and performance factor, in place of the last run the middle of the circle already tells. |
| `flow.rest_colour` | `true` | A resting box keeps its symbol in its own colour. Only the state greys out: what a box *is* does not change when it stops working. |
| `flow.foot` | `full` | `drive` keeps only electricity and ambient heat, `none` nothing. |
| `forecast_min_slope` | `0.4` | Kelvin per hour; below this measured fall the card says nothing about how long a store lasts. |
| `circuits[].icon`, `stores[].icon` | guessed | `floor`, `radiator`, `fancoil`, `pipe`, `water`, `buffer`, `loop`. |
| `circuits[].short`, `stores[].short` | guessed | The mark under the symbol, usually the storey. |
| `stores[].usable_max` | highest mark | What the level bar calls full. |
| `stores[].due_at` | `eco` | Which mark the measured cooling is counted down to. The line names that mark rather than promising a start: what the heat pump does when it gets there is its own business, and a surplus of sun may have it charge long before. |
| `flow.layout` | `columns` | `columns`: the heat pump heads the left column with hot water under it, and the heating group — the buffer, then the circuits it feeds — owns the right one. Two things beside each other instead of three, so a box is 171 px wide rather than 116, and the buffer reaches its circuits down the column instead of around the drawing. `split`: stores left, circuits right, the heat pump between them. |
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
