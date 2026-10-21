import styles from './Dashboard.module.css';

// Small dependency-free charts (CSS bars). Each is exposed to assistive tech as an image with a
// text summary, and the exact numbers are always printed next to the bars.

export interface StackedBar {
  key: string;
  label: string;
  billable: number;
  nonBillable: number;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function Legend() {
  return (
    <p className={styles.legend} aria-hidden="true">
      <span className={styles.swatchBillable} /> Billable
      <span className={styles.swatchNonBillable} /> Non-billable
    </p>
  );
}

/** Vertical stacked columns (days of the week, months of a year). */
export function ColumnChart({ bars, summary }: { bars: StackedBar[]; summary: string }) {
  const max = Math.max(1, ...bars.map((b) => b.billable + b.nonBillable));
  return (
    <div role="img" aria-label={summary} className={styles.columns}>
      {bars.map((b) => {
        const total = b.billable + b.nonBillable;
        return (
          <div key={b.key} className={styles.column}>
            <span className={styles.columnValue}>{total > 0 ? fmt(total) : ''}</span>
            <div className={styles.columnTrack}>
              <div
                className={styles.columnStack}
                style={{ height: `${(total / max) * 100}%` }}
                title={`${b.label}: ${fmt(total)} h (${fmt(b.billable)} billable)`}
              >
                <span className={styles.segNonBillable} style={{ flexGrow: b.nonBillable }} />
                <span className={styles.segBillable} style={{ flexGrow: b.billable }} />
              </div>
            </div>
            <span className={styles.columnLabel}>{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface HorizontalBar {
  key: string;
  label: string;
  sublabel?: string;
  billable: number;
  nonBillable: number;
}

/** Ranked horizontal stacked bars (hours by project / person). */
export function RankedBars({ rows, summary }: { rows: HorizontalBar[]; summary: string }) {
  const max = Math.max(1, ...rows.map((r) => r.billable + r.nonBillable));
  return (
    <ul className={styles.ranked} aria-label={summary}>
      {rows.map((r) => {
        const total = r.billable + r.nonBillable;
        return (
          <li key={r.key}>
            <div className={styles.rankedHead}>
              <span>
                <strong>{r.label}</strong>
                {r.sublabel && <span className="muted"> · {r.sublabel}</span>}
              </span>
              <span>{fmt(total)} h</span>
            </div>
            <div className={styles.rankedTrack} aria-hidden="true">
              <div className={styles.rankedFill} style={{ width: `${(total / max) * 100}%` }}>
                <span className={styles.segBillable} style={{ flexGrow: r.billable }} />
                <span className={styles.segNonBillable} style={{ flexGrow: r.nonBillable }} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One progress bar, e.g. budget used. `percent` may exceed 100 (bar is capped, text is not). */
export function ProgressBar({
  percent,
  tone,
  label,
}: {
  percent: number;
  tone: 'ok' | 'warning' | 'over';
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.round(percent))}
      className={styles.progressTrack}
    >
      <div
        className={`${styles.progressFill} ${styles[`progress_${tone}`]}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}
