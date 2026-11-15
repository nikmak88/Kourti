/**
 * Calendar subscription feed (services/calendarFeed.ts).
 *
 *   GET  /api/v1/calendar-feed/:token.ics   public - the token in the URL is the credential
 *   GET  /api/v1/calendar-feed-link          (signed in) my feed URL, created on first use
 *   POST /api/v1/calendar-feed-link/reset    (signed in) new URL; the old one stops working
 */
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/http.js';
import { buildFeedForToken, feedUrl, getOrCreateFeedToken, resetFeedToken } from '../../services/calendarFeed.js';

export const calendarFeedPublicRouter = Router();
export const calendarFeedLinkRouter = Router();

calendarFeedPublicRouter.get(
  '/:file',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ file: z.string().regex(/^[A-Za-z0-9_-]{20,100}\.ics$/) })
      .safeParse(req.params);
    const ics = parsed.success ? await buildFeedForToken(parsed.data.file.slice(0, -4)) : null;
    if (!ics) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    res
      .status(200)
      .set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="kourti.ics"',
        'Cache-Control': 'private, max-age=300',
        'X-Robots-Tag': 'noindex',
      })
      .send(ics);
  })
);

const linkResponse = (token: string) => {
  const url = feedUrl(token);
  return { url, webcal: url.replace(/^https?:\/\//, 'webcal://') };
};

calendarFeedLinkRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, organizationId } = req.auth!;
    res.status(200).json(linkResponse(await getOrCreateFeedToken(userId, organizationId)));
  })
);

calendarFeedLinkRouter.post(
  '/reset',
  asyncHandler(async (req, res) => {
    const { userId, organizationId } = req.auth!;
    res.status(200).json(linkResponse(await resetFeedToken(userId, organizationId)));
  })
);
