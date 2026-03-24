export type ContentTone =
  | "professional"
  | "conversational"
  | "storytelling"
  | "inspirational"
  | "educational"
  | "bold";

export type ContentIndustry =
  | "Technology"
  | "Finance"
  | "Healthcare"
  | "Marketing"
  | "E-commerce"
  | "SaaS"
  | "Consulting"
  | "Education"
  | "Real Estate"
  | "Media"
  | "General";

export interface ContentContext {
  subject: string;
  audience: string;
  industry: ContentIndustry;
  tone: ContentTone;
  brandVoice: string;
  keywords: string;
}

const WRITER_SYSTEM = `You are a senior content strategist and writer with 20 years of experience across digital publishing, brand storytelling, B2B/B2C marketing, and content systems design.

You don't just write — you architect content ecosystems. Every piece you create serves a clear strategic purpose: driving engagement, building authority, converting readers, and generating measurable business outcomes.

Your writing philosophy:
- Lead with audience psychology: understand what they fear, desire, and need to believe before they act
- Every headline is a promise; every paragraph earns the next
- Stories outperform statements — always anchor insights in narrative
- Data and specificity build trust ("73% of buyers" beats "many buyers")
- Every piece of content has ONE job: move the reader to the next step
- Platform-native writing: LinkedIn rewards insight + vulnerability, Twitter rewards wit + brevity, blogs reward depth + SEO, video scripts reward pacing + emotion

You operate as a strategic business partner, not a hired wordsmith. You ask: "What business outcome does this content serve?" before writing a single word.

Always produce complete, ready-to-publish content — not outlines or placeholders.`;

function toneInstruction(tone: ContentTone): string {
  const tones: Record<ContentTone, string> = {
    professional:
      "Write with authoritative confidence. Use precise language, data references, and industry-specific credibility markers. Formal but never stiff.",
    conversational:
      "Write like a brilliant friend who happens to be an expert. Use contractions, rhetorical questions, and second-person voice ('you'). Warm and direct.",
    storytelling:
      "Lead with narrative. Open with a scene, a person, or a moment. Let the insight emerge from the story rather than being stated upfront.",
    inspirational:
      "Write to move people to action. Use aspirational language, emotional resonance, and vivid future-state descriptions. Make readers feel the possibility.",
    educational:
      "Write to teach clearly. Break complex ideas into digestible steps. Use analogies, examples, and clear structure. Position the reader as capable of learning.",
    bold:
      "Write with conviction and edge. Take strong positions, challenge conventional wisdom, and don't hedge. Bold statements earn shares.",
  };
  return tones[tone];
}

// ── Blog Post ──────────────────────────────────────────────────────────────────

export function blogPostPrompt(ctx: ContentContext): string {
  return `${WRITER_SYSTEM}

CONTENT BRIEF:
- Subject: ${ctx.subject}
- Target Audience: ${ctx.audience}
- Industry: ${ctx.industry}
- Tone: ${ctx.tone.toUpperCase()} — ${toneInstruction(ctx.tone)}
- Keywords to weave in naturally: ${ctx.keywords || "derive from subject"}
- Brand voice notes: ${ctx.brandVoice || "none provided — use best judgment"}

DELIVERABLE: Write a complete, publish-ready long-form blog post (1,500–2,000 words).

Structure requirements:
1. **SEO-Optimized Headline** (contains primary keyword, <70 characters, creates curiosity or promises clear value)
2. **Hook paragraph** (first 2–3 sentences that stop the scroll — stat, bold claim, story, or provocative question)
3. **Introduction** (sets up the problem/opportunity, previews what the reader will learn, creates urgency)
4. **Body** (4–6 sections with H2 subheadings, each section making one clear point backed by example/data/story)
5. **Key Takeaways / Summary** (3–5 bullet points — skimmable gold)
6. **Call to Action** (one clear next step aligned to business goal)

SEO requirements:
- Primary keyword in headline, first paragraph, one H2, and conclusion
- Secondary keywords distributed naturally
- Internal link placeholders: [LINK: relevant topic]
- Meta description suggestion (155 characters)
- Suggested URL slug

Write the complete post now:`;
}

// ── LinkedIn Posts (10) ────────────────────────────────────────────────────────

export function linkedInPrompt(ctx: ContentContext): string {
  return `${WRITER_SYSTEM}

CONTENT BRIEF:
- Subject: ${ctx.subject}
- Target Audience: ${ctx.audience} (LinkedIn professional context)
- Industry: ${ctx.industry}
- Tone: ${ctx.tone.toUpperCase()} — ${toneInstruction(ctx.tone)}
- Brand voice notes: ${ctx.brandVoice || "none provided"}

DELIVERABLE: Write 10 distinct LinkedIn posts on different angles of the subject.

Each post MUST:
- Open with a hook line that stops the scroll (no "I'm excited to share" — lead with insight, data, or story)
- Be 150–300 words (optimal for LinkedIn algorithm)
- Use white space and line breaks for readability (LinkedIn's feed punishes walls of text)
- Include 1–2 relevant emojis (not more)
- End with an engagement question OR a strong point that invites comment
- Include 3–5 relevant hashtags at the end
- Have a distinct angle — no two posts should feel the same

The 10 angles to cover (one post each):
1. The Big Insight / Contrarian Take
2. Personal Story / Lesson Learned
3. Data-Driven Case (use plausible statistics)
4. Common Mistake + How to Fix It
5. Step-by-Step How-To (mini tutorial)
6. Industry Trend + What It Means for the Audience
7. Myth-Busting Post
8. "Hot Take" / Strong Opinion
9. Behind-the-Scenes / Process Reveal
10. Inspirational / Aspirational Vision

Clearly label each post: "POST 1:", "POST 2:", etc.

Write all 10 posts now:`;
}

// ── Tweets (3) ────────────────────────────────────────────────────────────────

export function tweetsPrompt(ctx: ContentContext): string {
  return `${WRITER_SYSTEM}

CONTENT BRIEF:
- Subject: ${ctx.subject}
- Target Audience: ${ctx.audience}
- Industry: ${ctx.industry}
- Tone: ${ctx.tone.toUpperCase()} — ${toneInstruction(ctx.tone)}

DELIVERABLE: Write 3 high-impact tweets (X posts) on this subject.

Each tweet MUST:
- Be under 280 characters (including spaces)
- Open with the strongest possible hook — the first 5 words determine if it gets read
- Be standalone (understandable without context)
- Be shareable — readers must want to retweet it because it makes THEM look smart or insightful
- One hashtag maximum (or none if it breaks the flow)

The 3 tweet types:
1. **The Insight Tweet** — A counterintuitive or surprising insight distilled to its sharpest form
2. **The Hook Thread Opener** — Designed to start a thread. Opens with a bold claim + "Here's why:" or "A thread:" to invite clicks for more
3. **The Quote/Wisdom Tweet** — A punchy, aphorism-style statement that stands alone as wisdom

Format each tweet exactly as it would appear when posted. Label: TWEET 1:, TWEET 2:, TWEET 3:

Write all 3 tweets now:`;
}

// ── Video Script ───────────────────────────────────────────────────────────────

export function videoScriptPrompt(ctx: ContentContext): string {
  return `${WRITER_SYSTEM}

CONTENT BRIEF:
- Subject: ${ctx.subject}
- Target Audience: ${ctx.audience}
- Industry: ${ctx.industry}
- Tone: ${ctx.tone.toUpperCase()} — ${toneInstruction(ctx.tone)}
- Target length: 5–8 minutes spoken (approximately 700–1,100 words of script)

DELIVERABLE: Write a complete video script for a YouTube/LinkedIn video on this subject.

Structure:
**[HOOK — 0:00–0:30]**
Open with the single most compelling hook possible. A shocking stat, a story that places the viewer in a situation, or a bold promise of transformation. The viewer must decide to keep watching within 15 seconds.

**[INTRO — 0:30–1:00]**
Introduce yourself briefly (leave a [NAME/BRAND] placeholder). Preview the 3 things viewers will learn. Create pattern interrupts to prevent drop-off.

**[MAIN CONTENT — 1:00–6:00]**
3 clearly structured sections, each with:
- A clear point stated upfront
- An example, story, or demonstration
- A specific takeaway or action
Include [B-ROLL SUGGESTION: ...] notes throughout for visual production.

**[SUMMARY — 6:00–6:30]**
Rapid-fire recap of the 3 key points. Reinforce the transformation the viewer now has.

**[CTA — 6:30–7:00]**
One clear call to action. Include: Like + Subscribe prompt, a resource offer ([LINK IN DESCRIPTION]), and a comment-bait question.

**[THUMBNAIL SUGGESTION]**
Describe the ideal thumbnail (text overlay, facial expression, visual element).

**[SEO METADATA]**
- Suggested video title (A/B test 2 options)
- Description (first 150 chars for above-fold)
- 10 tags

Write the complete script now:`;
}

// ── Instagram Posts (3) ────────────────────────────────────────────────────────

export function instagramPrompt(ctx: ContentContext): string {
  return `${WRITER_SYSTEM}

CONTENT BRIEF:
- Subject: ${ctx.subject}
- Target Audience: ${ctx.audience}
- Industry: ${ctx.industry}
- Tone: ${ctx.tone.toUpperCase()} — ${toneInstruction(ctx.tone)}

DELIVERABLE: Write 3 complete Instagram posts on different angles of this subject.

For EACH Instagram post, provide:
1. **Visual Direction** — describe the ideal image or carousel visual (what to show, colors, mood) so a designer or photographer knows exactly what to create
2. **Caption** (150–300 words) structured as:
   - Line 1: Hook (this is what appears before "more" — make it irresistible)
   - Body: Story, insight, or value delivery — use line breaks for readability
   - CTA: Direct action (save this, comment below, share with someone who needs this, link in bio)
3. **Hashtag Set** (20–25 hashtags, mix of high-volume + niche + branded placeholder [#YOURBRAND]) — place below a row of dots (...) so they collapse in the feed
4. **Story Version** — A 3-frame Instagram Story sequence summarizing the post (what to show/say on each frame)

The 3 post formats:
- POST A: Carousel (educational, "X things you didn't know about [subject]" format)
- POST B: Single image (inspirational quote or bold statement design)
- POST C: Reels cover (hook for a short video on this topic — write the script for a 30–60 second Reel)

Write all 3 Instagram posts now:`;
}

// ── Content Strategy Overview ──────────────────────────────────────────────────

export function contentStrategyPrompt(ctx: ContentContext): string {
  return `${WRITER_SYSTEM}

CONTENT BRIEF:
- Subject: ${ctx.subject}
- Target Audience: ${ctx.audience}
- Industry: ${ctx.industry}
- Tone: ${ctx.tone.toUpperCase()}

DELIVERABLE: Produce a Content Strategy Overview for this subject.

Sections:

## 1. Content Opportunity Analysis
- Why this topic matters RIGHT NOW (market timing, audience pain, trend signals)
- Search intent map: what is the audience actually looking for?
- Competitive gap: what angle does the market underserve?

## 2. Core Narrative / Messaging Architecture
- The BIG IDEA (one sentence that everything else flows from)
- 3 supporting pillars (each a sub-angle with its own content series potential)
- Key vocabulary and phrases to own in this space
- Phrases to avoid (overused, clichéd, trust-eroding)

## 3. Audience Psychology Profile
- Primary pain: what keeps them up at night?
- Primary desire: what do they want their world to look like?
- Belief to overcome: what false belief blocks them from taking action?
- Trust signal: what makes them believe YOU?

## 4. Content System Map
Show how the pieces connect:
\`\`\`
1 Blog Post (pillar)
├── 10 LinkedIn Posts (angles)
├── 3 Tweets (hooks)
├── 1 Video Script (depth)
└── 3 Instagram Posts (reach)
    ├── Traffic flows → Blog (SEO)
    ├── Engagement → Email capture
    └── Authority → Inbound leads
\`\`\`

## 5. Distribution & Amplification Plan
- Publishing cadence (when + how often per platform)
- Repurposing sequence (which piece to publish first and why)
- Engagement tactics (comment templates, DM follow-up)
- KPIs to track per content type

## 6. Revenue/Outcome Path
How does this content system translate to business outcomes? Map the journey:
Reader → Subscriber → Lead → Customer

Write the complete strategy now:`;
}
