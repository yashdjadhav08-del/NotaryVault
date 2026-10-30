export function formatDate(dateString: string): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateString;
  }
}

export function formatRelativeTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  } catch {
    return dateString;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export interface FormattedTimestamp {
  local: string;
  utc: string;
  timezoneLabel: string;
  iso: string;
  isValid: boolean;
}

/**
 * Formats a blockchain registration timestamp accurately.
 * Accepts ISO string, numeric timestamp in seconds or milliseconds, or Date.
 * Rejects 0, null, undefined, or empty values and returns 'Timestamp unavailable' without fabricating.
 * Clearly labels the user's local timezone.
 */
export function formatRegistrationTimestamp(rawTimestamp?: string | number | Date | null): FormattedTimestamp {
  if (rawTimestamp === undefined || rawTimestamp === null || rawTimestamp === '' || rawTimestamp === 0 || rawTimestamp === '0') {
    return {
      local: 'Timestamp unavailable',
      utc: 'Timestamp unavailable',
      timezoneLabel: '',
      iso: '',
      isValid: false,
    };
  }

  try {
    let d: Date;
    if (typeof rawTimestamp === 'number') {
      // If timestamp is in seconds (< 10000000000), convert to ms
      d = new Date(rawTimestamp < 10000000000 ? rawTimestamp * 1000 : rawTimestamp);
    } else if (rawTimestamp instanceof Date) {
      d = rawTimestamp;
    } else {
      const num = Number(rawTimestamp);
      if (!isNaN(num) && num > 0) {
        d = new Date(num < 10000000000 ? num * 1000 : num);
      } else {
        d = new Date(rawTimestamp);
      }
    }

    if (isNaN(d.getTime()) || d.getTime() === 0) {
      return {
        local: 'Timestamp unavailable',
        utc: 'Timestamp unavailable',
        timezoneLabel: '',
        iso: '',
        isValid: false,
      };
    }

    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    const local = d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });

    const utc = d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    return {
      local,
      utc,
      timezoneLabel: `Local Time (${tzName})`,
      iso: d.toISOString(),
      isValid: true,
    };
  } catch {
    return {
      local: 'Timestamp unavailable',
      utc: 'Timestamp unavailable',
      timezoneLabel: '',
      iso: '',
      isValid: false,
    };
  }
}
