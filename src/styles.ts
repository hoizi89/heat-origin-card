import { css } from "lit";

export const cardStyles = css`
  :host {
    /* Mode colours checked for colour-blind separation on light and dark cards. */
    --ho-heating: var(--heat-origin-heating-color, #e0702a);
    --ho-hot-water: var(--heat-origin-hot-water-color, #c9365f);
    --ho-cooling: var(--heat-origin-cooling-color, #5b8fd9);
    --ho-defrost: var(--heat-origin-defrost-color, #5b8fd9);
    --ho-air: var(--heat-origin-air-color, #57a85a);
    /* The electricity wears the colours Power Origin gives its sources. */
    --ho-sun: var(--heat-origin-sun-color, var(--power-origin-sun-color, #ffb020));
    --ho-grid: var(--heat-origin-grid-color, var(--power-origin-grid-color, #6e93d6));
    --ho-battery: var(--heat-origin-battery-color, var(--power-origin-battery-color, #4ecdc4));
    --ho-power: var(--heat-origin-power-color, #8e97ad);
    --ho-cold: var(--heat-origin-cold-color, #3d4a61);
    --ho-warn: var(--heat-origin-warning-color, #e5a53a);
    --ho-ink: var(--primary-text-color, #171a24);
    --ho-muted: var(--secondary-text-color, #666e88);
    --ho-hairline: var(--divider-color, #d6d9e4);
    --ho-track: var(--heat-origin-track-color, rgba(127, 133, 155, 0.22));
    --ho-surface: var(--ha-card-background, var(--card-background-color, #fff));
    --ho-mono: var(--code-font-family, ui-monospace, "SFMono-Regular", "Menlo", monospace);
    --ho-legio-ok: var(--heat-origin-ok-color, #30d158);
    --ho-legio-late: var(--heat-origin-late-color, #ff453a);
    display: block;
  }

  /* ── origin layout: one drawing that scales with the card ── */
  .origin svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .origin text {
    fill: var(--ho-ink);
    font-family: var(--ho-mono);
    font-variant-numeric: tabular-nums;
  }
  .origin .o-cap {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.09em;
    fill: var(--ho-muted);
  }
  .origin .o-value {
    font-size: 21px;
    font-weight: 700;
  }
  .origin .o-big {
    font-size: 27px;
    font-weight: 700;
  }
  .origin .o-unit {
    font-size: 12px;
    font-weight: 600;
  }
  .origin .o-small {
    font-size: 11px;
  }
  .origin .o-muted {
    fill: var(--ho-muted);
  }
  .origin .o-strong {
    font-weight: 700;
  }
  .origin .o-reason {
    fill: var(--ho-hot-water);
    opacity: 0.85;
  }
  .origin .o-note {
    font-size: 12px;
    font-weight: 700;
    fill: var(--ho-heating);
  }
  .origin .o-heat {
    font-size: 30px;
    font-weight: 700;
  }
  .origin .o-cop {
    font-size: 13px;
    font-weight: 700;
    fill: var(--ho-muted);
  }
  .origin .o-pause {
    font-size: 20px;
    font-weight: 700;
    fill: var(--ho-muted);
  }
  .origin .o-track {
    stroke: var(--ho-track);
  }
  .origin .o-track-fill {
    fill: var(--ho-track);
  }
  .origin .o-line {
    fill: none;
    stroke-width: 3;
    stroke-dasharray: 2 6;
    stroke-linecap: round;
  }
  .origin .o-line.idle {
    stroke-width: 2;
    stroke-dasharray: 2 5;
    opacity: 0.4;
  }
  .origin .o-line.flowing {
    animation: o-flow 1.2s linear infinite;
  }
  @keyframes o-flow {
    to {
      stroke-dashoffset: -16;
    }
  }
  .origin .o-pill {
    fill: rgba(0, 0, 0, 0.55);
  }
  .origin .o-pill-text {
    fill: #fff;
    font-size: 12.5px;
    font-weight: 700;
  }
  .origin .o-tick {
    font-size: 9.5px;
    fill: var(--ho-muted);
  }
  .origin .o-tank.active .o-rim {
    filter: drop-shadow(0 0 5px var(--glow, var(--ho-heating)));
  }
  .origin .o-tank,
  .origin .o-ring,
  .origin .o-circuit,
  .origin .o-badge {
    cursor: pointer;
  }
  .origin .o-row {
    fill: var(--ho-track);
    stroke: var(--ho-hairline);
    stroke-width: 1;
  }
  .origin .o-circuit.on .o-row {
    fill: color-mix(in srgb, var(--ho-heating) 14%, transparent);
    stroke: color-mix(in srgb, var(--ho-heating) 40%, transparent);
  }
  .origin .o-room {
    font-size: 17px;
    font-weight: 700;
  }
  .origin .o-circuit.off .o-room {
    fill: var(--ho-muted);
  }
  .origin .o-flow {
    fill: var(--ho-heating);
  }
  .origin .o-badge-text {
    font-size: 10px;
    font-weight: 700;
  }
  @media (prefers-reduced-motion: reduce) {
    .origin .o-line.flowing {
      animation: none;
    }
  }

  /* The dashboard's own face for everything; digits keep equal widths so values do not jump. */
  ha-card.font-system {
    --ho-mono: var(--ha-font-family-body, var(--primary-font-family, Roboto, "Segoe UI", sans-serif));
  }

  ha-card {
    font-variant-numeric: tabular-nums;
    color: var(--ho-ink);
    position: relative;
    container-type: inline-size;
    padding: 14px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
  }

  .warn {
    color: var(--ho-muted);
    font-size: 13px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px 10px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 5px;
    min-width: 0;
  }

  .title {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Without the title: running on the sun, and since when, as the head's own line. */
  .pv-mode {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 12px;
    color: var(--ho-muted);
    cursor: pointer;
  }

  .pv-mode svg {
    display: block;
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
  }

  .pv-mode,
  .pv-mode b,
  .pv-mode span {
    white-space: nowrap;
  }

  .pv-mode b {
    color: var(--ho-sun);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* Surplus solar: one small word by the title, in the sun's colour. */
  .pv {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--ho-sun);
    cursor: pointer;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--ho-mono);
    font-size: 11.5px;
    letter-spacing: 0.03em;
    padding: 4px 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tone, var(--ho-muted)) 18%, transparent);
    color: var(--ho-ink);
    white-space: nowrap;
    cursor: pointer;
  }

  .chip {
    border: 1px solid color-mix(in srgb, var(--tone, var(--ho-muted)) 45%, transparent);
  }

  .chip i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--tone, var(--ho-muted));
    flex: 0 0 7px;
    position: relative;
  }

  /* While something runs the dot breathes, so a still card still reads as alive. */
  .chip.live i::after {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 1.5px solid var(--tone, var(--ho-muted));
    animation: breathe 2.2s ease-out infinite;
  }

  @keyframes breathe {
    0% { transform: scale(0.6); opacity: 0.9; }
    70%, 100% { transform: scale(1.5); opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .chip.live i::after { animation: none; }
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  /* Spread out, the drawing stops growing where its words would get silly. */
  .section svg.wide {
    max-width: 760px;
    margin: 0 auto;
  }

  svg text {
    font-family: var(--ha-font-family-body, var(--primary-font-family, sans-serif));
    font-variant-numeric: tabular-nums;
  }

  svg .mono {
    font-family: var(--ho-mono);
  }

  .clickable {
    cursor: pointer;
  }

  /* Bright beads running along the active line, readable on a tablet across the room. */
  .flow-dash {
    stroke-dasharray: 0 12;
    stroke-linecap: round;
    animation: run 0.9s linear infinite;
  }

  @keyframes run {
    to {
      stroke-dashoffset: -12;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flow-dash {
      animation: none;
    }
  }

  .foot {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    font-family: var(--ho-mono);
    font-size: 12.5px;
    color: var(--ho-muted);
    font-variant-numeric: tabular-nums;
  }

  /* While running: the electricity, the ambient heat and the pump, each a named column. */
  .foot-cols {
    display: grid;
    grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
    gap: 10px;
  }

  .foot-col {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .foot-col small {
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .foot-col b {
    font-size: 13.5px;
    white-space: nowrap;
  }

  .foot-col span {
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .foot-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 4px 14px;
  }

  .foot-line > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .foot svg {
    display: block;
    width: 11px;
    height: 11px;
    flex: 0 0 11px;
  }

  .foot b {
    color: var(--ho-ink);
    font-weight: 500;
  }

  /* One row: the state, the figure that matters in it, and today as a thread. */
  ha-card.compact {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
    padding: 12px 16px;
  }

  .glyph {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--tone, var(--ho-muted)) 22%, transparent);
    color: var(--tone, var(--ho-muted));
    flex: 0 0 38px;
  }

  .glyph svg {
    width: 20px;
    height: 20px;
  }

  .words {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .words .state {
    font-weight: 600;
    font-size: 15px;
  }

  .words .sub {
    font-family: var(--ho-mono);
    font-size: 11.5px;
    color: var(--ho-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .big {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .big small {
    font-size: 12px;
    color: var(--ho-muted);
    font-weight: 400;
    margin-left: 2px;
  }

  .strip {
    flex-basis: 100%;
  }

  /* The flow in a narrow column: the heat pump across, the takers as a list. */
  .sinks {
    display: grid;
    gap: 5px;
  }

  .sink {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1.5px solid var(--ho-hairline);
    font-size: 12.5px;
    cursor: pointer;
  }

  .sink.active {
    border-color: var(--tone);
    background: color-mix(in srgb, var(--tone) 14%, transparent);
  }

  .sink .n {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .sink .n small {
    font-size: 10px;
    letter-spacing: 0.05em;
    color: var(--ho-muted);
  }

  .sink.active .n small {
    color: var(--tone);
  }

  .sink .v {
    font-family: var(--ho-mono);
    font-size: 11.5px;
    color: var(--ho-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sink.active .v {
    color: var(--ho-ink);
  }
`;
