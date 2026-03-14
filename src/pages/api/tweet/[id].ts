import type { APIRoute } from "astro";

export const prerender = false;

const TWEET_ID_RE = /^\d{1,20}$/;
const SYNDICATION_URL = "https://cdn.syndication.twimg.com";

function getToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, "");
}

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!(id && TWEET_ID_RE.test(id))) {
    return Response.json({ data: null }, { status: 400 });
  }

  const url = new URL(`${SYNDICATION_URL}/tweet-result`);
  url.searchParams.set("id", id);
  url.searchParams.set("lang", "en");
  url.searchParams.set(
    "features",
    [
      "tfw_timeline_list:",
      "tfw_follower_count_sunset:true",
      "tfw_tweet_edit_backend:on",
      "tfw_refsrc_session:on",
      "tfw_fosnr_soft_interventions_enabled:on",
      "tfw_show_birdwatch_pivots_enabled:on",
      "tfw_show_business_verified_badge:on",
      "tfw_duplicate_scribes_to_settings:on",
      "tfw_use_profile_image_shape_enabled:on",
      "tfw_show_blue_verified_badge:on",
      "tfw_legacy_timeline_sunset:true",
      "tfw_show_gov_verified_badge:on",
      "tfw_show_business_affiliate_badge:on",
      "tfw_tweet_edit_frontend:on",
    ].join(";")
  );
  url.searchParams.set("token", getToken(id));

  try {
    const res = await fetch(url.toString());
    const isJson = res.headers
      .get("content-type")
      ?.includes("application/json");

    if (!(res.ok && isJson)) {
      return Response.json({ data: null }, { status: res.ok ? 500 : 404 });
    }

    const data = await res.json();

    if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
      return Response.json({ data: null }, { status: 404 });
    }

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return Response.json({ data: null }, { status: 500 });
  }
};
