import type { FilterType } from "../imageFilters";
import { ALL_FILTERS, FILTER_LABELS } from "../imageFilters";

/** Lightweight haptic feedback for mobile. */
function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // silently ignore
  }
}

interface FilterToolbarProps {
  currentFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  disabled: boolean;
}

export function FilterToolbar({ currentFilter, onFilterChange, disabled }: FilterToolbarProps) {
  return (
    <div className="bg-gray-900 px-3 py-2.5">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {ALL_FILTERS.map((f) => {
          const isActive = f === currentFilter;
          return (
            <button
              key={f}
              onClick={() => {
                vibrate(10);
                onFilterChange(f);
              }}
              disabled={disabled}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
              } disabled:opacity-50`}
            >
              {FILTER_LABELS[f]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
