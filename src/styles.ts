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
    display: block;
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
    gap: 12px;
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
    gap: 10px;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--ho-mono);
    font-size: 10.5px;
    letter-spacing: 0.03em;
    padding: 4px 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tone, var(--ho-muted)) 18%, transparent);
    color: var(--ho-ink);
    white-space: nowrap;
    cursor: pointer;
  }

  .chip i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--tone, var(--ho-muted));
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section + .section {
    padding-top: 12px;
    border-top: 1px solid var(--ho-hairline);
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    font-family: var(--ho-mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    color: var(--ho-muted);
  }

  /* Only the label is set in capitals; figures keep the case of their units: kWh, not KWH. */
  .section-head > span:first-child {
    text-transform: uppercase;
  }

  .section-head b {
    color: var(--ho-ink);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
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
    flex-wrap: wrap;
    gap: 4px 14px;
    font-family: var(--ho-mono);
    font-size: 11.5px;
    color: var(--ho-muted);
    font-variant-numeric: tabular-nums;
  }

  .foot b {
    color: var(--ho-ink);
    font-weight: 500;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 11.5px;
    color: var(--ho-muted);
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sw {
    width: 12px;
    height: 8px;
    border-radius: 2px;
    display: inline-block;
  }

  .sw.hatch {
    background: repeating-linear-gradient(45deg, var(--ho-muted) 0 1.4px, var(--ho-track) 1.4px 4px);
  }

  .sw.defrost {
    background: repeating-linear-gradient(45deg, var(--ho-defrost) 0 2px, color-mix(in srgb, var(--ho-defrost) 45%, transparent) 2px 4px);
  }

  .sw.pv {
    background: color-mix(in srgb, var(--ho-sun) 35%, transparent);
    border-top: 1.5px solid var(--ho-sun);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .stat-k {
    font-family: var(--ho-mono);
    font-size: 10.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ho-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stat-v {
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    display: flex;
    align-items: baseline;
    gap: 3px;
    white-space: nowrap;
  }

  .stat-sub {
    display: flex;
    flex-wrap: wrap;
    gap: 0 6px;
    margin-top: 1px;
    font-family: var(--ho-mono);
    font-size: 10.5px;
    color: var(--ho-muted);
    font-variant-numeric: tabular-nums;
  }

  .stat-sub b {
    color: var(--ho-ink);
    font-weight: 600;
  }

  .stat-sub i {
    font-style: normal;
    font-size: 8px;
    margin-left: 2px;
    vertical-align: 1px;
    color: var(--ho-ink);
  }

  .stat.warn .stat-v {
    color: var(--ho-warn);
  }

  .stat.warn .stat-v svg {
    width: 11px;
    height: 11px;
    align-self: center;
  }

  .stat-v small {
    font-family: var(--ho-mono);
    font-size: 10.5px;
    font-weight: 400;
    color: var(--ho-muted);
    margin: 0 2px 0 1px;
  }

  .alert {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    padding: 7px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--ho-warn) 13%, transparent);
  }

  .alert svg {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
  }

  .seg:focus-visible {
    outline: none;
    stroke: var(--ho-ink);
    stroke-width: 1.5;
  }

  .tip {
    position: absolute;
    z-index: 2;
    pointer-events: none;
    background: var(--ho-surface);
    color: var(--ho-ink);
    border: 1px solid var(--ho-hairline);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 11.5px;
    white-space: nowrap;
    transform: translate(-50%, calc(-100% - 8px));
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  }

  .loading {
    font-size: 12px;
    color: var(--ho-muted);
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

  /* Storage: the number first; the tank a level gauge of one height for every store. */
  .store {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    gap: 4px 12px;
    align-items: start;
    cursor: pointer;
  }

  .store + .store {
    padding-top: 10px;
    border-top: 1px dashed var(--ho-hairline);
  }

  .tank {
    grid-row: 1 / span 2;
    align-self: start;
    height: 84px;
    border-radius: 10px;
    border: 1.5px solid var(--ho-hairline);
    background: var(--ho-track);
    position: relative;
    overflow: hidden;
  }

  .tank .fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
  }

  /* Marks as notches on both walls, readable over the filling and the empty part alike. */
  .tank .tick {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
  }

  .tank .tick::before,
  .tank .tick::after {
    content: "";
    position: absolute;
    top: -0.75px;
    width: 6px;
    border-top: 1.5px solid var(--ho-ink);
    opacity: 0.5;
  }

  .tank .tick::before {
    left: 0;
  }

  .tank .tick::after {
    right: 0;
  }

  .store-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .store-name {
    font-size: 12px;
    color: var(--ho-muted);
  }

  .store-temp {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .store-temp small {
    font-size: 12px;
    font-weight: 500;
    color: var(--ho-muted);
    margin-left: 2px;
  }

  .store-state {
    font-size: 12px;
    font-weight: 600;
  }

  .store-sub {
    font-family: var(--ho-mono);
    font-size: 10.5px;
    color: var(--ho-muted);
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .store-sub.loop-on {
    color: var(--ho-hot-water);
  }

  .store-energy {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
  }

  .store-kwh {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .store-kwh small {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--ho-muted);
    margin-left: 2px;
  }

  .store-above {
    font-family: var(--ho-mono);
    font-size: 10.5px;
    color: var(--ho-muted);
  }

  .marks {
    grid-column: 2 / span 2;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .mark {
    font-family: var(--ho-mono);
    font-size: 10.5px;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid var(--ho-hairline);
    color: var(--ho-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .mark.reached {
    border-color: transparent;
    background: color-mix(in srgb, var(--tone) 22%, transparent);
    color: var(--ho-ink);
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

  @container (max-width: 340px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
