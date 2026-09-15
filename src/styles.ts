import { css } from "lit";

export const cardStyles = css`
  :host {
    /* Mode colours checked for colour-blind separation on light and dark cards. */
    --ho-heating: var(--heat-origin-heating-color, #dc6f2a);
    --ho-hot-water: var(--heat-origin-hot-water-color, #c94f9b);
    --ho-cooling: var(--heat-origin-cooling-color, #5b8fd9);
    --ho-defrost: var(--heat-origin-defrost-color, #5b8fd9);
    --ho-air: var(--heat-origin-air-color, #2e9e8f);
    --ho-power: var(--heat-origin-power-color, #7d7fe0);
    --ho-sun: var(--heat-origin-sun-color, var(--energy-solar-color, #ffb020));
    --ho-warn: var(--heat-origin-warning-color, #e5a53a);
    --ho-ink: var(--primary-text-color, #171a24);
    --ho-muted: var(--secondary-text-color, #666e88);
    --ho-hairline: var(--divider-color, #d6d9e4);
    --ho-track: var(--heat-origin-track-color, rgba(127, 133, 155, 0.22));
    --ho-surface: var(--ha-card-background, var(--card-background-color, #fff));
    --ho-mono: var(--code-font-family, ui-monospace, "SFMono-Regular", "Menlo", monospace);
    display: block;
  }

  ha-card {
    color: var(--ho-ink);
    position: relative;
    container-type: inline-size;
    padding: 16px 16px 14px;
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
    letter-spacing: 0.06em;
    text-transform: uppercase;
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
    padding-top: 14px;
    border-top: 1px solid var(--ho-hairline);
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    font-family: var(--ho-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ho-muted);
  }

  .section-head b {
    color: var(--ho-ink);
    font-weight: 500;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  svg text {
    font-family: var(--ha-font-family-body, var(--primary-font-family, sans-serif));
  }

  svg .mono {
    font-family: var(--ho-mono);
  }

  .clickable {
    cursor: pointer;
  }

  .flow-dash {
    stroke-dasharray: 6 8;
    animation: run 1.1s linear infinite;
  }

  @keyframes run {
    to {
      stroke-dashoffset: -14;
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
    font-size: 11px;
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
    font-size: 9.5px;
    letter-spacing: 0.1em;
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

  .origin-big {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  .origin-big .n {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .origin-big .s {
    color: var(--ho-muted);
    font-size: 13px;
  }

  .origin-row {
    display: grid;
    gap: 5px;
  }

  .origin-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    font-size: 13px;
  }

  .origin-line .name {
    font-weight: 500;
  }

  .origin-line .mono,
  .origin-sub {
    font-family: var(--ho-mono);
    font-variant-numeric: tabular-nums;
  }

  .origin-line .dim,
  .origin-sub {
    color: var(--ho-muted);
    font-size: 11.5px;
  }

  .bar {
    display: flex;
    gap: 2px;
    height: 12px;
  }

  .bar span {
    height: 100%;
  }

  .bar span:first-child {
    border-radius: 4px 0 0 4px;
  }

  .bar span:last-child {
    border-radius: 0 4px 4px 0;
  }

  .bar span:only-child {
    border-radius: 4px;
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
    font-size: 11px;
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

  @container (max-width: 300px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
