# Heat Origin

A heat pump card for Home Assistant. Where the heat comes from, where it goes, and how the day went. The sister card to [Power Origin](https://github.com/hoizi89/power-origin-card).

- **Heat flow** — electricity and ambient heat flow into the heat pump, the heat flows on to whatever is taking it: hot water, buffer, each heating circuit. Line widths follow the kilowatts, the ring shows the share that came from the air. Circuits show their own state, room temperature and, optionally, flow, return and spread.
- **Day band** — yesterday and today as 24-hour bands coloured by what the heat pump did, with PV power above. Starts and running time are counted from the history, and a run shorter than two minutes is flagged.
- **Heat today** — the day's heat per mode, split into electricity and ambient heat, with the COP of the day, month and year.
- **Storage** — hot water and buffer on one temperature scale, top and bottom sensor, layering, and the set-points you enter.
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
    circulation: sensor.lambdawp_boil1_actual_circulation_temperature
    marks: { eco: 44.5, target: 48.5, pv: 57.5 }
  - name: Buffer
    kind: buffer
    top: sensor.lambdawp_buff1_actual_high_temperature
    bottom: sensor.lambdawp_buff1_actual_low_temperature
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
| `shape` | `standard` | `compact` is one row. |
| `sections.flow` / `day` / `origin` / `stores` | on, stores only with stores | `sections.order` sets the order. |
| `entities.cop` | | A live COP sensor; otherwise heat divided by electricity. |
| `entities.heat_today`, `electric_today` | | Totals, for heat pumps that do not split by mode. |
| `entities.cop_heating_month` … `cop_hot_water_year` | | Shown under the day's heat. |
| `circuits[].active` | HEATING, ECO, COOLING, … | Words of the circuit's state that mean it takes heat. |
| `stores[].kind` | guessed from the name | `hot_water` or `buffer`. |
| `stores[].marks` | | `eco`, `target`, `pv`, `max` as numbers. |
| `flow.spread` | `true` | Flow, return, spread and volume under the drawing. |
| `flow.circuit_details` | `false` | Flow, return and spread inside each circuit. |
| `flow.extras` | | Further figures, `{ entity, name }`. |
| `day.days` | `2` | `1` shows today only. |
| `day.short_run` | `120` | Seconds; shorter runs are flagged. `0` turns it off. |

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
