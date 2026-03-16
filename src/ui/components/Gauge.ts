/**
 * Gauge Component — Circular/arc gauge for readiness scores
 *
 * Displays a value within a min–max range as an SVG arc.
 * Used for exam readiness gauge.
 * Purely visual — no domain imports.
 */

export interface GaugeOptions {
  /** Current value */
  readonly value: number;
  /** Minimum of the scale */
  readonly min: number;
  /** Maximum of the scale */
  readonly max: number;
  /** Optional label displayed below the value */
  readonly label?: string;
  /** Size in pixels (defaults to 120) */
  readonly size?: number;
  /** Optional extra CSS class */
  readonly className?: string;
}

/**
 * Creates a gauge element using SVG.
 *
 * Renders a 240-degree arc where the filled portion represents
 * the ratio of (value - min) / (max - min).
 *
 * @param options - Gauge configuration
 * @returns A gauge HTMLElement containing an SVG
 */
export function createGauge(options: GaugeOptions): HTMLElement {
  const { min, max, label } = options;
  const size = options.size ?? 120;
  const range = max - min;
  const value = Math.max(min, Math.min(max, options.value));
  const ratio = range > 0 ? (value - min) / range : 0;

  // Arc geometry: 240° sweep, starting at 150° (bottom-left)
  const svgNS = "http://www.w3.org/2000/svg";
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - 12) / 2; // leave room for stroke
  const strokeWidth = 8;
  const startAngle = 150; // degrees
  const sweepAngle = 240;

  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const arcPath = (angleDeg: number): string => {
    const endAngle = startAngle + angleDeg;
    const x1 = cx + radius * Math.cos(toRad(startAngle));
    const y1 = cy + radius * Math.sin(toRad(startAngle));
    const x2 = cx + radius * Math.cos(toRad(endAngle));
    const y2 = cy + radius * Math.sin(toRad(endAngle));
    const largeArc = angleDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const container = document.createElement("div");
  container.className = "gx-gauge";
  if (options.className) {
    container.classList.add(options.className);
  }

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.classList.add("gx-gauge__svg");

  // Background track arc
  const trackPath = document.createElementNS(svgNS, "path");
  trackPath.setAttribute("d", arcPath(sweepAngle));
  trackPath.setAttribute("fill", "none");
  trackPath.setAttribute(
    "stroke",
    "var(--border-color, rgba(255,255,255,0.1))",
  );
  trackPath.setAttribute("stroke-width", String(strokeWidth));
  trackPath.setAttribute("stroke-linecap", "round");
  svg.appendChild(trackPath);

  // Filled arc
  if (ratio > 0) {
    const fillPath = document.createElementNS(svgNS, "path");
    fillPath.setAttribute("d", arcPath(sweepAngle * ratio));
    fillPath.setAttribute("fill", "none");
    fillPath.setAttribute("stroke", "var(--accent-primary, #00d4ff)");
    fillPath.setAttribute("stroke-width", String(strokeWidth));
    fillPath.setAttribute("stroke-linecap", "round");
    fillPath.classList.add("gx-gauge__fill");
    svg.appendChild(fillPath);
  }

  // Center value text
  const text = document.createElementNS(svgNS, "text");
  text.setAttribute("x", String(cx));
  text.setAttribute("y", String(cy + 4));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.classList.add("gx-gauge__value");
  text.textContent = String(Math.round(value));
  svg.appendChild(text);

  container.appendChild(svg);

  if (label) {
    const labelEl = document.createElement("span");
    labelEl.className = "gx-gauge__label";
    labelEl.textContent = label;
    container.appendChild(labelEl);
  }

  return container;
}
