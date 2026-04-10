import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { ensureEvlogError } from "../../lib/evlog";
import { buildSyndicationRequestInit } from "../../lib/syndication";

export const prerender = false;

const TWEET_ID_RE = /^\d{1,20}$/;

interface SyndicationPhoto {
  expandedUrl: string;
  height: number;
  url: string;
  width: number;
}

interface SyndicationResponse {
  photos?: SyndicationPhoto[];
}

export const GET: APIRoute = async ({ url, request }) => {
  const log = createWorkersLogger(request);
  const id = url.searchParams.get("id");

  if (!(id && TWEET_ID_RE.test(id))) {
    log.set({ media: { id, valid: false } });
    log.emit({ status: 400 });
    return Response.json({ photos: [] }, { status: 400 });
  }

  log.set({ media: { tweetId: id } });

  const token = Math.round((Number(id) / 1e15) * Math.PI);
  const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`;

  try {
    const res = await fetch(apiUrl, buildSyndicationRequestInit());

    if (!res.ok) {
      log.set({ media: { fetchStatus: res.status, photoCount: 0 } });
      log.emit({ status: 200 });
      return Response.json({ photos: [] });
    }

    const data = (await res.json()) as SyndicationResponse;
    const photos = (data.photos ?? []).map(
      ({ url: photoUrl, width, height }) => ({
        height,
        url: photoUrl,
        width,
      })
    );

    log.set({ media: { photoCount: photos.length } });
    log.emit({ status: 200 });

    return new Response(JSON.stringify({ photos }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to fetch tweet media");
    log.error(evlogError);
    log.emit({ status: 200 });
    return Response.json({ photos: [] });
  }
};
