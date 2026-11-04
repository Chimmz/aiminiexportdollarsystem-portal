import { timingSafeEqual } from 'node:crypto';

// Shared by every route mini-export-web calls server-to-server (see
// api/webhooks/sales-site/**) -- a secret only the two servers know stands
// in for a gateway signature, since there's no gateway payload on these
// requests to verify a signature against in the first place.
export function verifySalesSiteSecret(req: Request): boolean {
  const expected = process.env.SALES_SITE_API_SECRET;
  if (!expected) return false;

  const provided = req.headers.get('x-sales-site-secret') ?? '';
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
