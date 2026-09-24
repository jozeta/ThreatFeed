/**
 * Relative and editorial date formatting for ThreatFeed
 */

export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    // Future protection
    if (diffMs < 0) return 'Just now';

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    // Over a week ago: e.g. "24 Sep" or "24 Sep 2025"
    const isThisYear = date.getFullYear() === now.getFullYear();
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      ...(isThisYear ? {} : { year: 'numeric' })
    };
    return date.toLocaleDateString(undefined, options);
  } catch {
    return 'Recently';
  }
}

export function formatMastheadDate(date: Date = new Date()): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  };
  return date.toLocaleDateString('en-US', options).toUpperCase();
}

export function formatFullDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateString;
  }
}
