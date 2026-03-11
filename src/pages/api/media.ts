import type { APIRoute } from "astro";

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

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id");
  if (!(id && TWEET_ID_RE.test(id))) {
    return Response.json({ photos: [] }, { status: 400 });
  }

  const token = Math.round((Number(id) / 1e15) * Math.PI);
  const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`;

  try {
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
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

    return new Response(JSON.stringify({ photos }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return Response.json({ photos: [] });
  }
};
