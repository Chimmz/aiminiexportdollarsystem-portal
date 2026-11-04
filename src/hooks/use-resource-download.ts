'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

// Shared by the Resources page and the dashboard home card's resources
// list -- both need the same "click, show Downloading..., trigger a real
// file save" behavior. A plain <a href="/api/resources/download/id">
// would've been simpler, but gives no hook to show a loading state from
// (a browser-native download has no "done" event to listen for from an
// anchor click alone) -- fetching the bytes ourselves and handing them to
// a throwaway blob-URL anchor is what makes that state observable, while
// keeping the actual Cloudinary URL exactly as hidden as it already was
// (never a static href on the page, fetched fresh per click, revoked
// immediately after).
export function useResourceDownload() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = useCallback(
    async (resourceId: string, fallbackFilename: string) => {
      if (downloadingId) return;
      setDownloadingId(resourceId);
      try {
        const res = await fetch(`/api/resources/download/${resourceId}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const blob = await res.blob();

        const disposition = res.headers.get('content-disposition') ?? '';
        const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackFilename;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('[resources] download failed:', err);
        toast('Could not download that file. Try again.');
      } finally {
        setDownloadingId(null);
      }
    },
    [downloadingId]
  );

  return { downloadingId, download };
}
