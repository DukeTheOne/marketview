import type { PriceAlert } from '../../../core/schemas/alert';
import type { CoordinateProjector } from '../types';

export interface PriceAlertLinesLayerProps {
  ticker: string;
  alerts: PriceAlert[];
  projector: CoordinateProjector;
  referenceTimestamp?: number;
  onDismissAlert?: (id: string) => void;
  onDeleteAlert?: (id: string) => void;
}

export function PriceAlertLinesLayer({
  ticker,
  alerts,
  projector,
  referenceTimestamp,
  onDismissAlert,
  onDeleteAlert,
}: PriceAlertLinesLayerProps) {
  const matchingAlerts = alerts.filter(
    (a) =>
      a.ticker === ticker &&
      (a.status === 'ACTIVE' || a.status === 'TRIGGERED')
  );

  if (matchingAlerts.length === 0) {
    return null;
  }

  return (
    <div
      className="price-alert-lines-layer pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-testid="price-alert-lines-layer"
    >
      {matchingAlerts.map((alert) => {
        const directY = projector.priceToCoordinate
          ? projector.priceToCoordinate(alert.targetPrice)
          : null;
        const screenPoint =
          directY !== null
            ? { x: 0, y: directY }
            : projector.logicalToScreen({
                timestamp: referenceTimestamp ?? alert.createdAt,
                price: alert.targetPrice,
              });

        if (!screenPoint) {
          return null;
        }

        const isTriggered = alert.status === 'TRIGGERED';
        const isCrossingUp = alert.condition === 'CROSSING_UP';

        const lineAccentClass = isTriggered
          ? 'border-rose-500/80'
          : isCrossingUp
            ? 'border-emerald-500/70'
            : 'border-amber-500/70';

        const badgeAccentClass = isTriggered
          ? 'bg-rose-950/95 text-rose-200 border-rose-500/50'
          : isCrossingUp
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
            : 'bg-amber-950/90 text-amber-300 border-amber-500/40';

        const conditionSymbol = isCrossingUp ? '▲' : '▼';

        return (
          <div
            key={alert.id}
            data-testid={`price-alert-line-${alert.id}`}
            data-alert-status={alert.status}
            data-alert-condition={alert.condition}
            style={{ top: `${screenPoint.y}px` }}
            className={`pointer-events-none absolute inset-x-0 border-t border-dashed ${lineAccentClass}`}
          >
            <div
              className={`pointer-events-auto absolute right-2 -top-3 flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-mono shadow-md backdrop-blur-sm ${badgeAccentClass}`}
            >
              <span aria-hidden="true">{conditionSymbol}</span>
              <span className="font-semibold">
                ${alert.targetPrice.toFixed(2)}
              </span>
              {isTriggered && (
                <span className="rounded bg-rose-500/30 px-1 py-0.2 font-sans text-[9px] font-bold uppercase tracking-wider text-rose-100">
                  Triggered
                </span>
              )}
              {alert.note && (
                <span className="max-w-[140px] truncate font-sans text-[10px] opacity-85">
                  {alert.note}
                </span>
              )}
              {isTriggered && onDismissAlert && (
                <button
                  type="button"
                  data-testid={`dismiss-alert-${alert.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissAlert(alert.id);
                  }}
                  className="ml-1 rounded bg-rose-500/20 px-1.5 py-0.2 font-sans text-[10px] font-semibold text-rose-100 hover:bg-rose-500/40"
                  title="Dismiss alert"
                >
                  Dismiss
                </button>
              )}
              {onDeleteAlert && (
                <button
                  type="button"
                  data-testid={`delete-alert-${alert.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAlert(alert.id);
                  }}
                  className="ml-0.5 rounded px-1 text-xs leading-none opacity-75 hover:bg-white/10 hover:opacity-100"
                  title="Delete alert"
                  aria-label={`Delete alert ${alert.id}`}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
