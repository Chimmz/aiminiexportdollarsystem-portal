import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/actions/user-actions';
import { getResourcePrivateDownloadUrl } from '@/lib/actions/resources-actions';
import { resources } from '@/lib/mock-data/resources';

// Member-facing filename ("Mini_Export_Dollar_System_Guide.pdf"), not the
// internal Cloudinary slug private_download_url would otherwise name the
// file after.
function filenameFor(resourceId: string): string {
  const title = resources.find((r) => r.id === resourceId)?.title ?? resourceId;
  const safe = title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${safe}.pdf`;
}

// Signed in but no download link is ever printed in the page itself, and
// (unlike a redirect) no Cloudinary domain ever appears in the browser's
// own Network tab either -- this route fetches the signed, 60-second
// Cloudinary URL itself, server-side, and streams the bytes straight
// through with its own Content-Disposition (a member-facing filename,
// not Cloudinary's own public_id-derived one). Same-tab, same-origin the
// whole way: the browser just sees a download starting, nothing to
// navigate away from or close.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { resourceId } = await params;
  const cloudinaryUrl = getResourcePrivateDownloadUrl(resourceId);
  if (!cloudinaryUrl) {
    return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });
  }

  const upstream = await fetch(cloudinaryUrl);
  if (!upstream.ok || !upstream.body) {
    console.error(`[resources] Cloudinary download failed for ${resourceId}: ${upstream.status}`);
    return NextResponse.json({ error: 'Could not fetch resource' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/pdf',
      'Content-Disposition': `attachment; filename="${filenameFor(resourceId)}"`,
      ...(upstream.headers.get('content-length')
        ? { 'Content-Length': upstream.headers.get('content-length')! }
        : {}),
    },
  });
}
