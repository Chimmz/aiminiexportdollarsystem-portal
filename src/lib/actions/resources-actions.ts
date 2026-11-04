import { v2 as cloudinary } from 'cloudinary';

// Server-only registry mapping the stable ids already used in
// src/lib/mock-data/resources.ts (client-facing title/description) to
// their Cloudinary public_id. Deliberately kept out of that file -- the
// public_id has no reason to ever reach a client bundle. All 4 were
// uploaded as `type: authenticated`, `resource_type: raw` -- not publicly
// reachable by URL at all without a signed request, only ever generated
// here, server-side, per download.
const RESOURCE_PUBLIC_IDS: Record<string, string> = {
  'main-guide': 'resources/main-guide.pdf',
  'buyer-contacts': 'resources/buyer-contacts.pdf',
  'supplier-contacts': 'resources/supplier-contacts.pdf',
  'logistics-contacts': 'resources/logistics-contacts.pdf',
};

// 60 seconds is plenty for the route handler below to fetch this right
// after generating it -- short enough that a leaked URL (e.g. captured
// from server logs) is dead within a minute.
const SIGNED_URL_TTL_SECONDS = 60;

// Verified end-to-end before wiring this into the route: cloudinary.url()
// with sign_url + type: 'authenticated' 401s on this account -- that CDN
// URL-signing scheme isn't what gates `authenticated` delivery here.
// utils.private_download_url() is what Cloudinary's own docs point to for
// private/authenticated assets specifically -- it hits a dedicated
// api.cloudinary.com/.../download action, signed the same way the
// Admin/Upload API already is (which the upload step already proved
// works against this account's credentials). It has no filename-override
// param, and defaults to the public_id's own last segment (e.g.
// "main-guide.pdf") -- not something to show a paying member, which is
// why the route handler re-wraps this with its own Content-Disposition
// instead of just redirecting here directly.
export function getResourcePrivateDownloadUrl(resourceId: string): string | null {
  const publicId = RESOURCE_PUBLIC_IDS[resourceId];
  if (!publicId) return null;

  return cloudinary.utils.private_download_url(publicId, undefined as unknown as string, {
    resource_type: 'raw',
    type: 'authenticated',
    attachment: true,
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
  });
}
