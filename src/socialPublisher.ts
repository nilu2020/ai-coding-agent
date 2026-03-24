import * as crypto from "crypto";
import * as https from "https";

// ── Credential types ──────────────────────────────────────────────────────────

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export interface LinkedInCredentials {
  accessToken: string;
  personId: string; // The person URN ID, e.g. "aBcD1234"
}

export interface InstagramCredentials {
  accessToken: string;
  userId: string; // Instagram Business Account User ID
}

// ── Twitter / X ───────────────────────────────────────────────────────────────

function oauthSign(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
  creds: TwitterCredentials
): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const allParams: Record<string, string> = { ...bodyParams, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramStr = sortedKeys
    .map((k) => `${pct(k)}=${pct(allParams[k])}`)
    .join("&");

  const sigBase = [method.toUpperCase(), pct(url), pct(paramStr)].join("&");
  const sigKey = `${pct(creds.apiSecret)}&${pct(creds.accessTokenSecret)}`;
  const signature = crypto
    .createHmac("sha1", sigKey)
    .update(sigBase)
    .digest("base64");

  oauthParams["oauth_signature"] = signature;

  const header =
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${pct(k)}="${pct(oauthParams[k])}"`)
      .join(", ");

  return header;
}

function pct(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

export function postToTwitter(
  text: string,
  creds: TwitterCredentials
): Promise<{ id: string; url: string }> {
  return new Promise((resolve, reject) => {
    // Twitter v2 endpoint — text must be ≤280 chars
    const tweet = text.slice(0, 280);
    const url = "https://api.twitter.com/2/tweets";
    const body = JSON.stringify({ text: tweet });
    const authHeader = oauthSign("POST", url, {}, creds);

    const req = https.request(
      {
        hostname: "api.twitter.com",
        path: "/2/tweets",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            if (j.errors || j.error) {
              reject(
                new Error(
                  j.errors?.[0]?.message ?? j.error ?? "Twitter API error"
                )
              );
            } else {
              const id = j.data?.id ?? "";
              resolve({
                id,
                url: `https://twitter.com/i/web/status/${id}`,
              });
            }
          } catch {
            reject(new Error(`Twitter API returned: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────

export function postToLinkedIn(
  text: string,
  creds: LinkedInCredentials
): Promise<{ id: string; url: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      author: `urn:li:person:${creds.personId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    });

    const req = https.request(
      {
        hostname: "api.linkedin.com",
        path: "/v2/ugcPosts",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            if (j.serviceErrorCode || j.status >= 400) {
              reject(
                new Error(
                  j.message ?? `LinkedIn API error (status ${j.status})`
                )
              );
            } else {
              // LinkedIn returns the post URN in the X-RestLi-Id header or body id
              const postId = (j.id ?? "").replace(
                "urn:li:ugcPost:",
                ""
              );
              resolve({
                id: j.id ?? "",
                url: `https://www.linkedin.com/feed/update/${j.id ?? ""}`,
              });
            }
          } catch {
            reject(new Error(`LinkedIn API returned: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Instagram (Meta Graph API) ────────────────────────────────────────────────
// Two-step: create media container → publish

function igRequest(
  path: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const bodyStr = new URLSearchParams(body).toString();
    const req = https.request(
      {
        hostname: "graph.facebook.com",
        path: `/v18.0${path}`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data) as Record<string, unknown>;
            if (j.error) {
              const e = j.error as Record<string, unknown>;
              reject(new Error(String(e.message ?? "Instagram API error")));
            } else {
              resolve(j);
            }
          } catch {
            reject(new Error(`Instagram API returned: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

export async function postToInstagram(
  caption: string,
  imageUrl: string | undefined,
  creds: InstagramCredentials
): Promise<{ id: string; url: string }> {
  // Step 1: Create container
  const containerParams: Record<string, string> = {
    caption,
    access_token: creds.accessToken,
  };

  if (imageUrl) {
    containerParams.image_url = imageUrl;
    containerParams.media_type = "IMAGE";
  } else {
    // Text-only not supported natively; use a placeholder image approach
    // Instagram requires media — if none provided, throw helpful error
    throw new Error(
      "Instagram requires a media URL. Provide an image URL for the post."
    );
  }

  const container = await igRequest(
    `/${creds.userId}/media`,
    containerParams
  );
  const containerId = container.id as string;

  // Step 2: Publish the container
  const published = await igRequest(`/${creds.userId}/media_publish`, {
    creation_id: containerId,
    access_token: creds.accessToken,
  });

  const postId = published.id as string;
  return {
    id: postId,
    url: `https://www.instagram.com/p/${postId}/`,
  };
}

// ── Content parsers ───────────────────────────────────────────────────────────
// Extract individual posts/tweets from generated AI content

export interface ParsedPost {
  index: number;
  label: string;
  content: string;
}

export function parseTweets(raw: string): ParsedPost[] {
  const posts: ParsedPost[] = [];
  const regex = /TWEET\s*(\d+)\s*:([^]*?)(?=TWEET\s*\d+\s*:|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const content = match[2].trim();
    if (content) {
      posts.push({ index: parseInt(match[1]), label: `Tweet ${match[1]}`, content });
    }
  }
  // Fallback: split by double newlines if no labels found
  if (posts.length === 0) {
    raw
      .split(/\n\n+/)
      .filter((s) => s.trim().length > 10)
      .slice(0, 3)
      .forEach((content, i) => {
        posts.push({ index: i + 1, label: `Tweet ${i + 1}`, content: content.trim() });
      });
  }
  return posts;
}

export function parseLinkedInPosts(raw: string): ParsedPost[] {
  const posts: ParsedPost[] = [];
  const regex = /POST\s*(\d+)\s*:([^]*?)(?=POST\s*\d+\s*:|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const content = match[2].trim();
    if (content && content.length > 20) {
      posts.push({ index: parseInt(match[1]), label: `Post ${match[1]}`, content });
    }
  }
  if (posts.length === 0) {
    raw
      .split(/\n---+\n/)
      .filter((s) => s.trim().length > 20)
      .slice(0, 10)
      .forEach((content, i) => {
        posts.push({ index: i + 1, label: `Post ${i + 1}`, content: content.trim() });
      });
  }
  return posts;
}

export function parseInstagramPosts(raw: string): ParsedPost[] {
  const posts: ParsedPost[] = [];
  const regex = /POST\s*([A-C])\s*:([^]*?)(?=POST\s*[A-C]\s*:|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    // Extract just the caption section from the Instagram post
    const full = match[2].trim();
    // Try to extract the caption portion (between Visual Direction and Hashtag Set)
    const captionMatch = full.match(/\*\*Caption\*\*[:\s]*([^]*?)(?=\*\*Hashtag|\*\*Story|$)/i);
    const caption = captionMatch ? captionMatch[1].trim() : full.slice(0, 2000);
    if (caption.length > 20) {
      posts.push({ index: posts.length + 1, label: `Post ${match[1]}`, content: caption });
    }
  }
  if (posts.length === 0) {
    raw
      .split(/\n---+\n/)
      .filter((s) => s.trim().length > 20)
      .slice(0, 3)
      .forEach((content, i) => {
        posts.push({ index: i + 1, label: `Post ${i + 1}`, content: content.trim().slice(0, 2000) });
      });
  }
  return posts;
}
