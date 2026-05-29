# Party Mode — Concept Pitch for JioSaavn (copy doc)

> Same narrative as `party-mode-deck.html`, in plain text — reuse these lines for an
> email, DM, or tweet thread. **All market figures are illustrative estimates; verify
> before sending.**

Contact: **Rishi · rishinikamai@gmail.com**

---

### 1. Title
**Party Mode** — Turn JioSaavn into the DJ at every Indian party.
A premium feature concept, backed by a working prototype.

### 2. The Problem — the "DJ Gap"
Every party song has a peak. The second it ends and the next track starts cold, the dance
floor dies and stays dead through the intro.

Example (with real timestamps I use):
- **Chaiyya Chaiyya** (~7:00): peak runs **0:54–1:54** — the rest is filler
- **Kajra Re** (~6:00): peak runs **1:00–2:20** — buildup before, fade after

When *Chaiyya Chaiyya*'s peak ends at 1:54 and *Kajra Re*'s peak doesn't start until 1:00,
that's **≈1 min 6 sec of dead dance floor between two bangers**.
**Nobody dances to an intro.**

### 3. The Insight
Every song has a peak — people only want the peaks. At a party, listeners want bangers back
to back, blended. That's literally what a DJ does by hand. The peak is measurable: the
most-replayed, highest-energy stretch of the track.

### 4. The Solution — Party Mode
One toggle, zero dead air. Flip Party Mode on → the app auto-plays each song's peak section
and crossfades into the next song's peak. No requests, no buildup, no buzzkill.
**A DJ in every pocket.**

### 5. Proof — I already built it ("Groovy")
A working Spotify browser extension that:
- Stores each song's peak (in/out timestamps)
- Auto-skips the moment the peak ends
- Seeks the next song straight to its peak
- Has a schema already built for crowd/AI-derived peaks (confidence scoring)

**The wall I hit:** Spotify's API exposes no crossfade control, so transitions stay glitchy.
I can skip and seek, but I can't blend — a ceiling I can't break from the outside.

### 6. Why JioSaavn (not me) should own this
- JioSaavn owns its own player → full crossfade & gapless control
- JioSaavn owns the Indian catalog and the party-culture audience
- The exact blocker that stops me on Spotify doesn't exist on your stack
**You already own the two things Spotify won't hand me.**

### 7. The cheap moat — find the peak without expensive AI
1. **Crowdsourced behavior:** you already log where users skip, replay, and seek across
   millions of streams → aggregate into a per-song average in-point / out-point.
2. **No LLM required:** simple statistical aggregation + filtering, optional light
   audio-energy pass. Cheap to compute, smarter with every stream.
**The data already lives on your servers — it's just never been mined for this.**

### 8. Why now — the Spotify "Mix" gap
Spotify just shipped "Mix," but that recreates the sentimental personal *mixtape* — not the
party, not the DJ. The party floor is wide open; first mover owns the category.

### 9. The business case — casual house parties (not weddings)
The real market isn't weddings — those hire a DJ. It's the everyday apartment, dorm, and
pre-game party, where music runs off a phone and there's no DJ to save the vibe.
- **Huge & constant:** every weekend, every city, zero booking or budget.
- **High-intent, high-spend moment:** people in party mode pay for anything that keeps the
  night going — Party Mode is exactly that.
- **Viral:** one party exposes a whole room of friends at once → word-of-mouth acquisition.
- **Converts & sticks:** a premium reason to upgrade, longer sessions, clean differentiator.
- *Illustrative:* +0.5 pts paid conversion on ~100M users ≈ 500K new subscribers (validate).

### 10. How it works (one pipeline)
Listening logs (skip/replay/seek) → aggregate peak detection → store in/out timestamps +
confidence per track → player plays peaks with native crossfade. Mirrors my proven prototype
schema (a peaks table with in-time, out-time & confidence score).

### 11. Phased rollout (low risk)
- **Phase 1:** crowd-derive peaks for the top ~10k party songs (data only, no player change)
- **Phase 2:** crossfade / gapless engine in the player, gated to peak segments
- **Phase 3:** Party Mode toggle + group / social party sessions

### 12. The ask
I built a prototype — and tested it at real parties.

I've been using Groovy at college dorm parties and frat parties. It works — the energy stays
up. I have screen recordings of each transition: the song that ends, the song that starts,
and where the peaks land.

If this sounds interesting, I'd be happy to share the recordings or walk you through how it
works. I'm not pitching myself — just the idea. If JioSaavn ships this, everyone wins.

**Rishi · rishinikamai@gmail.com**

---

## Bonus — short versions

**Tweet / DM (≤280 chars):**
> Hey @JioSaavn — I built a prototype that auto-plays just the *peak* of each song and
> skips the dead air. Tested it at college parties — it works. Spotify can't do crossfade;
> you can. Happy to share screen recordings. rishinikamai@gmail.com

**One-line elevator pitch:**
> I built a "Party Mode" prototype — auto-plays each song's peak, skips to the next song's
> peak — and tested it at real parties. JioSaavn owns its player, so you could add crossfade
> and ship this as a premium feature.
