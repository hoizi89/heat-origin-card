# Changelog

## 2.0.2

- **Buffer: usable from what the circuits ask now.** The buffer counts its heat above the warmest flow target of the circuits that are on, not above a fixed or learned floor. "0.0 kWh" no longer shows while the floor heating, asking for 29 °C, still draws from a 34 °C buffer. The forecast keeps its learned floor.
- **Cleaner tanks.** The edge sits under the readings, as a clear dark line with a light seam. Its label steps off a reading at the same height and never leaves the tank; an edge inside a round cap marks a sliver and is not drawn. The readings stay at their sensor height but inside the straight part of the capsule, apart from each other.
- **No more "0 starts".** A heat pump that has run since before midnight says so; a day without any run shows no line.
- **Legionella badge in calendar days.** New option `entities.legionella_last` (an input_datetime or timestamp): the days are counted by calendar, as a daily automation counts them. While a disinfection runs the badge says so and pulses (still with reduced motion).
- **Hot water first.** While the heat pump charges hot water, a circuit below its flow target shows "hot water first" in grey instead of an orange deviation; the flow moves into the tooltip.

## 2.0.1

- **Shower litres rise smoothly.** A slice now counts in part between a kelvin under the mix temperature and three over it, in full above. With a hard cut a nearly uniform store jumped from 149 to 246 litres when it warmed by 0.9 K across the line. Hot and cold stores give the same litres as before.

## 2.0.0

### New: the origin layout, now the default

The card reads top to bottom: where the heat comes from, what is stored, where it goes.

- **Ring as a sum.** Electricity plus ambient heat is the heat. The electricity sits on the left, split by source (sun, battery, grid), the ambient heat fills the rest; every arc is as long as its share, and each source's line ends at its own arc. "% of the heat" stands under both sources. While the heat pump stands, the ring is grey and says "Pause".
- **Stores standing upright.** Hot water and buffer as capsules in two clear colours (no blending: below 35 °C blue, below 39 °C light blue, below 45 °C yellow, below 52 °C orange, then red). The edge between them sits where the water stops being usable (hot water 39 °C, buffer its usable minimum), with a thin dark line and the temperature beside it. Both readings stand at the height of their sensor (`top_height`, `bottom_height`). A charging store glows and its line moves.
- **Hot water in litres.** Litres of shower water at 38 °C mixed with 10 °C cold water (`mix`, `cold`, or `usable: kwh`), worked out layer by layer along the two sensors. Optional: the reason for the set-point (`entities.hot_water_reason`) and a badge with the days since 60 °C (`entities.legionella_days`).
- **Buffer in kWh, layer by layer.** A mean of both sensors called a layered buffer empty while its top was still warm; the layers count what is there. The learned forecast stays: "full ≈" while charging on the sun, "until ≈" while it carries the house.
- **The day and the circuits.** Bottom left: electricity today, performance factor, hours of heating and hot water, starts. Bottom right: one line per circuit, green while its flow meets its target (`flow.on_target`, 0.5 K), orange with the deviation, grey with "off since".
- **Tap for history.** A store opens the history of its two sensors and its target, a circuit room, flow and flow target, the ring the heat pump's state.

### Kept

The 1.x drawing is still there: `layout: classic` (or `columns`, `split`). Every option of 1.x keeps working for it.

### From 1.18.0

- Hot water whose set-point is steered from outside shows where it is headed: "charging → 59°", or "Target 41°" at rest.
