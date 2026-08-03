import { config } from '../config.js';
import { log } from './store.js';
import { TONES, toneById } from '../catalog.js';

async function chatJSON(system, user, { maxTokens = 1800 } = {}) {
  if (!config.openai.key) throw new Error('OpenAI key is not set. Add OPENAI_API_KEY.');
  const res = await fetch(`${config.openai.base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.key}`
    },
    body: JSON.stringify({
      model: config.openai.textModel,
      temperature: 0.8,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The model returned something that was not valid JSON.');
  }
}

/** Pull readable text off a page so the model can actually read the site. */
export async function readPage(url, label) {
  if (!url) return { url: '', label, ok: false, text: '', note: 'No URL provided.' };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url.startsWith('http') ? url : `https://${url}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Smart1RadioStudio/1.0 (+marketing script research)' }
    });
    clearTimeout(timeout);
    if (!res.ok) return { url, label, ok: false, text: '', note: `Page returned ${res.status}.` };
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1] || '';
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 7000);
    return { url, label, ok: true, title: title.trim(), description: desc.trim(), text };
  } catch (err) {
    log.warn('readPage', `${url}: ${err.message}`);
    return { url, label, ok: false, text: '', note: `Couldn't reach the page (${err.message}).` };
  }
}

/**
 * Read home page + landing page + promotion notes, and come back with a
 * creative brief plus three recommended tones out of the fifteen.
 */
export async function analyzeProject({ brand, customer, historyHint = [] }) {
  const [home, landing] = await Promise.all([
    readPage(customer.homeUrl, 'Home page'),
    readPage(customer.landingUrl, 'Landing page')
  ]);

  const toneMenu = TONES.map((t) => `- ${t.id}: ${t.label} — ${t.direction}`).join('\n');
  const history = historyHint.length
    ? `\nTONES THAT HAVE WORKED FOR THIS AGENCY'S CLIENTS BEFORE (weigh these up, but only where they genuinely fit): ${historyHint.join(', ')}`
    : '';

  const result = await chatJSON(
    `You are a senior radio copy strategist at Smart 1 Marketing, a digital agency that buys streaming radio on Pandora, Spotify and iHeart. You read a client's site and their promotion, then brief the creative team. You are specific and you never invent facts, offers, prices or claims that are not in the source material. Reply as JSON only.`,
    `CLIENT
Company: ${brand?.name || customer.company || customer.customerName}
Industry: ${brand?.industry || 'unknown'}
Location: ${brand?.location || 'unknown'}
Brand description: ${brand?.description || 'n/a'}

HOME PAGE (${home.url || 'none'})
${home.ok ? `${home.title}\n${home.description}\n${home.text}` : home.note}

LANDING PAGE (${landing.url || 'none'})
${landing.ok ? `${landing.title}\n${landing.description}\n${landing.text}` : landing.note}

PROMOTION DETAILS FROM THE CLIENT
${customer.promotion || 'None supplied.'}

REQUIRED DISCLAIMER (must be read verbatim inside the spot)
${customer.disclaimer || 'None.'}

TONE MENU
${toneMenu}${history}

Return JSON shaped exactly like:
{
  "summary": "3-4 sentences on what this business actually does and who buys from them",
  "audience": "one sentence on the listener we are targeting",
  "offer": "the promotion in one plain sentence, or 'No specific offer supplied' ",
  "differentiators": ["3-5 short proof points pulled from the pages"],
  "callToAction": "the single action the listener should take",
  "mustSay": ["names, phone numbers, URLs or legal wording that must appear verbatim"],
  "avoid": ["2-4 things the script should not claim or say"],
  "recommendedTones": [{"toneId":"one of the menu ids","why":"one sentence tied to this client"}]
}
Give exactly 3 recommendedTones, best first.`,
    { maxTokens: 1600 }
  );

  return { ...result, sources: { home: { url: home.url, ok: home.ok, note: home.note || null }, landing: { url: landing.url, ok: landing.ok, note: landing.note || null } } };
}

/** Write a matched 15-second and 30-second pair in one call so they share a hook. */
export async function writeScripts({ analysis, brand, customer, toneId, revisionNote, previous }) {
  const disclaimer = String(customer.disclaimer || '').trim();
  const tone = toneById(toneId);
  if (!tone) throw new Error('Unknown tone.');

  const revisionBlock = revisionNote
    ? `\nThe client reviewed the previous draft and asked for this change:\n"${revisionNote}"\n\nPREVIOUS DRAFT\n15s: ${previous?.fifteen?.script || ''}\n30s: ${previous?.thirty?.script || ''}\n\nRewrite both lengths honoring the request. Keep everything the client did not object to.`
    : '';

  return chatJSON(
    `You write streaming-radio commercials for Smart 1 Marketing. Radio is heard, not read: write for the ear. Rules you never break — the brand name is said at least twice in a :30 and at least once in a :15; the call to action is the last thing heard; you never invent an offer, price, discount, guarantee or statistic that was not supplied; you never write sound effects the client did not ask for; a :15 runs 35-42 words and a :30 runs 70-85 words at a natural read pace. Reply as JSON only.`,
    `TONE: ${tone.label} — ${tone.direction}

BRIEF
Business: ${brand?.name || customer.company || customer.customerName}
What they do: ${analysis?.summary || ''}
Listener: ${analysis?.audience || ''}
Offer: ${analysis?.offer || ''}
Proof points: ${(analysis?.differentiators || []).join(' | ')}
Call to action: ${analysis?.callToAction || ''}
Must say verbatim: ${(analysis?.mustSay || []).join(' | ') || 'nothing specific'}
Do not say: ${(analysis?.avoid || []).join(' | ') || 'nothing specific'}
Client's own promotion notes: ${customer.promotion || 'none'}
${disclaimer ? `\nREQUIRED DISCLAIMER — reproduce word for word as the last thing before the call to action, in BOTH lengths. It counts toward the word budget, so write the rest shorter to make room:\n"${disclaimer}"\n` : ''}${revisionBlock}

Return JSON:
{
  "hook": "the shared opening idea in a few words",
  "fifteen": {"script":"the :15 read, plain spoken text only","wordCount":0,"estimatedSeconds":15,"notes":"one line of direction for the voice talent"},
  "thirty": {"script":"the :30 read, plain spoken text only","wordCount":0,"estimatedSeconds":30,"notes":"one line of direction for the voice talent"}
}
The script fields contain only words to be spoken. No labels, no "VO:", no timestamps, no stage directions.`,
    { maxTokens: 1400 }
  );
}

/** Suggested voice profile, generated in the background while the client picks. */
export async function suggestVoiceProfile({ analysis, customer, toneIds }) {
  const tones = toneIds.map((t) => toneById(t)?.label).filter(Boolean).join(', ');
  return chatJSON(
    `You are a casting director for radio voiceover. You recommend a voice, not a person. Reply as JSON only.`,
    `Tones selected: ${tones}
Business: ${analysis?.summary || customer.company || customer.customerName}
Listener: ${analysis?.audience || ''}
Offer: ${analysis?.offer || ''}

Return JSON:
{
  "recommendation": {"gender":"female|male|neutral|any","age":"young|middle_aged|old|any","accent":"american|british|australian|transatlantic|any","energy":"laid_back|conversational|energetic|explosive","delivery":"announcer|narrator|best_friend|spokesperson|character"},
  "why": "two sentences on why this voice suits this listener",
  "searchTerms": ["3-6 words a voice library would tag this voice with"]
}`,
    { maxTokens: 600 }
  );
}

/** Headline + art direction for the streaming companion banner. */
export async function bannerCopy({ analysis, brand, customer, toneId }) {
  const tone = toneById(toneId);
  return chatJSON(
    `You write companion banner copy for streaming audio ads. The banner is small and glanceable: a listener sees it on a phone lock screen for a few seconds. Reply as JSON only.`,
    `Tone: ${tone.label} — ${tone.direction}
Business: ${brand?.name || customer.company || customer.customerName}
Offer: ${analysis?.offer || customer.promotion || ''}
Call to action: ${analysis?.callToAction || ''}

Return JSON:
{"headline":"4 words maximum","subline":"6 words maximum","cta":"2-3 words, a button label"}`,
    { maxTokens: 300 }
  );
}

/** Generate the banner background art with the image model. */
export async function bannerArt({ brand, toneId, headline }) {
  if (!config.openai.key) throw new Error('OpenAI key is not set.');
  const tone = toneById(toneId);
  const palette = (brand?.colors || []).slice(0, 3).map((c) => c.hex).join(', ') || 'deep navy, warm orange';

  const prompt = `A clean abstract background graphic for a streaming-audio companion banner. Mood: ${tone.bannerMood}. Color palette: ${palette}. Composition: strong empty area on the left third for a logo and headline to be placed later. No text, no letters, no words, no numbers, no logos, no watermarks, no people's faces. Flat modern advertising art direction, high contrast, print-clean edges.`;

  const res = await fetch(`${config.openai.base}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openai.key}` },
    body: JSON.stringify({
      model: config.openai.imageModel,
      prompt,
      size: '1024x1024',
      n: 1
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI images ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const item = data.data?.[0];
  if (item?.b64_json) return { b64: item.b64_json, prompt, headline };
  if (item?.url) {
    const img = await fetch(item.url);
    const buf = Buffer.from(await img.arrayBuffer());
    return { b64: buf.toString('base64'), prompt, headline };
  }
  throw new Error('The image model returned no image.');
}

/**
 * The read came back over the slot. Cut words without losing the offer, the
 * brand name, the call to action or any required disclaimer.
 */
export async function tightenScript({ script, seconds, trimWords, toneId, analysis, customer }) {
  const tone = toneById(toneId);
  const disclaimer = String(customer?.disclaimer || '').trim();
  const target = Math.max(8, (script || '').split(/\s+/).filter(Boolean).length - trimWords);

  return chatJSON(
    `You are a radio copy editor. You cut for time. You never drop the brand name, the offer, the call to action or a required disclaimer — you cut adjectives, subordinate clauses and setup instead. Reply as JSON only.`,
    `This :${seconds} read came in ${trimWords} word${trimWords === 1 ? '' : 's'} too long for the slot.

TONE: ${tone?.label || ''} — keep it.
Brand name and call to action are mandatory: ${analysis?.callToAction || ''}
${disclaimer ? `This disclaimer must survive word for word: "${disclaimer}"` : ''}

CURRENT SCRIPT (${(script || '').split(/\s+/).filter(Boolean).length} words)
${script}

Rewrite it at roughly ${target} words. Same meaning, same tone, fewer words.

Return JSON: {"script":"the tightened read, spoken words only","wordCount":0,"whatWentAndWhy":"one sentence"}`,
    { maxTokens: 700 }
  );
}

/** Turn the tone and the brief into a music-generation prompt for a bed. */
export async function bedPrompt({ analysis, customer, brand, toneId }) {
  const tone = toneById(toneId);
  return chatJSON(
    `You write prompts for an AI music generator. The output is a background bed for a radio commercial, so it must never compete with a speaking voice: no vocals, moderate dynamics, uncluttered midrange. You describe genre, instrumentation, tempo and mood in plain concrete terms. Reply as JSON only.`,
    `Tone of the spot: ${tone?.label || ''} — ${tone?.direction || ''}
Business: ${brand?.name || customer?.company || customer?.customerName || ''}
Industry: ${brand?.industry || 'unknown'}
Listener: ${analysis?.audience || ''}
Offer: ${analysis?.offer || ''}

Return JSON:
{
  "prompt": "one or two sentences describing the bed — genre, instruments, tempo in BPM, mood",
  "why": "one short sentence on why it fits this spot and this listener",
  "alternates": ["two other one-line directions worth trying"]
}`,
    { maxTokens: 450 }
  );
}
