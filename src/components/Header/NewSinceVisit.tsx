import React, { useMemo } from 'react';
import { useFeeds } from '../../context/FeedContext';
import { formatSince, newSince, olderThan } from '../../services/lastVisit';

interface NewSinceVisitProps {
  className?: string;
  /** Style of the Catch up button (the header line is plain text, the Filter sheet uses the bordered buttons) */
  buttonClassName?: string;
  /** Text before the count, rendered only when the indicator is */
  separator?: string;
}

/** "37 new since 08:12" and the Catch up action that marks everything older than the last visit as read */
export const NewSinceVisit: React.FC<NewSinceVisitProps> = ({ className = '', buttonClassName = '', separator }) => {
  const { articles, visitBaseline, markAllAsRead } = useFeeds();

  const { newCount, unreadOlderIds } = useMemo(() => ({
    newCount: visitBaseline === null ? 0 : newSince(articles, visitBaseline).length,
    unreadOlderIds: visitBaseline === null ? [] : olderThan(articles, visitBaseline).filter((a) => !a.read).map((a) => a.id),
  }), [articles, visitBaseline]);

  if (visitBaseline === null) return null;

  return (
    <span className={className}>
      {separator}
      <span className="uppercase">{newCount.toLocaleString()} new since {formatSince(visitBaseline, Date.now())}</span>
      {unreadOlderIds.length > 0 && (
        <button
          onClick={() => markAllAsRead(unreadOlderIds)}
          title={`Mark the ${unreadOlderIds.length.toLocaleString()} unread articles from before your last visit as read`}
          className={buttonClassName}
        >
          Catch up
        </button>
      )}
    </span>
  );
};
