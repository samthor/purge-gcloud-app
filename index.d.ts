
export interface PurgeOptions {
  project: string,
  service?: string,
  keepMinimum?: number,
  keepDailyAmount?: number,
  log?: (string) => void,
};

export default function(options: PurgeOptions): number;
