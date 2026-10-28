import { useEffect } from 'react';
import { useFeeds } from '../context/FeedContext';

interface UseKeyboardNavigationProps {
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  isModalOpen: boolean;
}

export function useKeyboardNavigation({
  onOpenShortcuts,
  isModalOpen,
}: UseKeyboardNavigationProps) {
  const { refreshFeeds, isRefreshing } = useFeeds();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      // Leave browser/OS shortcuts (Cmd/Ctrl+R reload, Cmd/Ctrl+F find, ...) alone
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // If modal is open, modal handles its own Escape / navigation
      if (isModalOpen && e.key !== 'Escape') {
        return;
      }

      switch (e.key) {
        case 'r':
          e.preventDefault();
          if (!isRefreshing) {
            refreshFeeds();
          }
          break;
        case 'f':
        case '/':
          e.preventDefault();
          const searchInput = document.getElementById('global-search-input') as HTMLInputElement | null;
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
          break;
        case '?':
          e.preventDefault();
          onOpenShortcuts();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRefreshing, refreshFeeds, onOpenShortcuts, isModalOpen]);
}
