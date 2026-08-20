export const formatCalories = (cal: number): string => `${Math.round(cal).toLocaleString()} kcal`;

export const formatWeight = (val: number, unit: 'kg' | 'lbs'): string => `${val.toFixed(1)} ${unit}`;

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs > 0 ? `${secs}s` : ''}`;
};

export const formatDate = (dateInput: Date | string | number): string => {
  const date = new Date(dateInput);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatNumber = (num: number): string => num.toLocaleString();

const ML_PER_FL_OZ = 29.5735;

/**
 * Water is stored in millilitres; display follows the user's unit preference.
 * Metric switches to litres past 1 L so the number stays short.
 */
export const formatVolume = (ml: number, units: 'metric' | 'imperial' = 'metric'): string => {
  if (units === 'imperial') return `${Math.round(ml / ML_PER_FL_OZ)} fl oz`;
  if (ml < 1000) return `${Math.round(ml)} ml`;
  return `${(ml / 1000).toFixed(1)} L`;
};

/** Short unit label for a goal shown next to an already-formatted value. */
export const volumeUnitLabel = (ml: number, units: 'metric' | 'imperial' = 'metric'): string =>
  units === 'imperial' ? 'fl oz' : ml < 1000 ? 'ml' : 'L';
