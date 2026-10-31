/** "Page 2 of 6", small and dim in the bottom-right corner of a TV screen; nothing when there is no label */
export default function PageCounter({ label }: { label: { page: number; of: number } | null }) {
  if (!label) return null;
  return (
    <div className="tv-page-counter" aria-live="off">
      Page {label.page} of {label.of}
    </div>
  );
}
