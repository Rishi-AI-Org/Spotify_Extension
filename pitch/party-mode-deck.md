# Party Mode Concept Pitch for JioSaavn (copy doc)

> Same narrative as `party-mode-deck.html`, in plain text — reuse these lines for an
> email, DM, or tweet thread. **All market figures are illustrative estimates; verify
> before sending.**

Contact: **Rishi · rishinikamai@gmail.com**

---

### 1. Title
**Party Mode** Turn JioSaavn into the DJ at every Indian party.
A premium feature concept, backed by a working prototype.

### 2. The Problem the "DJ Gap"
Every party song has a peak. The second it ends and the next track starts cold, the dance
floor dies and stays dead through the intro.

Example (with real timestamps I use):
- **Chaiyya Chaiyya** (7:00): peak runs **0:54–1:54**  the rest is filler
- **Kajra Re** (6:00): peak runs **1:00–2:20**  buildup before, fade after

When *Chaiyya Chaiyya*'s peak ends at 1:54 and *Kajra Re*'s peak doesn't start until 1:00,
that's **≈1 min 6 sec of dead dance floor between two bangers**.
**Nobody dances to an intro.**

### 3. Why this matters (especially in India)
Music *is* the party. *(illustrative figures)*
- 10M weddings/year in India  each one a dance floor
- $130B+ Indian wedding economy; music & DJs are core spend
- 185M+ music streaming users in India, growing fast
- 0 streaming apps that own the "party" moment today

### 4. The Insight
Every song has a peak people only want the peaks. At a party, listeners want bangers back
to back, blended. That's literally what a DJ does by hand. The peak is measurable: the
most-replayed, highest-energy stretch of the track.

### 5. The Solution — Party Mode
One toggle, zero dead air. Flip Party Mode on → the app auto-plays each song's peak section
and crossfades into the next song's peak. No requests, no buildup, no buzzkill.
**A DJ in every pocket.**

### 6. Proof I already built it ("Groovy")
A working Spotify browser extension that:
- Stores each song's peak (in/out timestamps)
- Auto-skips the moment the peak ends
- Seeks the next song straight to its peak
- Has a schema already built for crowd/AI-derived peaks (confidence scoring)

**The wall I hit:** Spotify's API exposes no crossfade control, so transitions stay glitchy.
I can skip and seek, but I can't blend a ceiling I can't break from the outside. JioSavaan has no API

### 7. Why JioSaavn (not me) should own this
- JioSaavn owns its own player → full crossfade & gapless control
- JioSaavn owns the Indian catalog and the party-culture audience
- The exact blocker that stops me on Spotify doesn't exist on your stack
**You already own the two things Spotify won't hand me.**

### 8. The cheap moat find the peak without expensive AI
1. **Crowdsourced behavior:** you already log where users skip, replay, and seek across
   millions of streams → aggregate into a per-song average in-point / out-point.
2. **No LLM required:** simple statistical aggregation + filtering, optional light
   audio-energy pass. Cheap to compute, smarter with every stream.
**The data already lives on your servers — it's just never been mined for this.**

### 9. Why now the Spotify "Mix" gap
Spotify just shipped "Mix," but that recreates the sentimental personal *mixtape* not the
party, not the DJ. The party floor is wide open; first mover owns the category.

### 10. The business case
- **Converts:** India's paid conversion is 1–2%; Party Mode is a reason to upgrade that
  hits hardest in a crowd.
- **Viral:** one party exposes dozens of guests at once → word-of-mouth acquisition.
- **Sticky:** longer sessions, higher retention, clean differentiator vs. Spotify & YT Music.
- *Illustrative:* +0.5 pts paid conversion on ~100M users ≈ 500K new subscribers (validate).

### 11. How it works (one pipeline)
Listening logs (skip/replay/seek) → aggregate peak detection → store in/out timestamps +
confidence per track → player plays peaks with native crossfade. Mirrors my proven prototype
schema (a peaks table with in-time, out-time & confidence score).

### 12. Phased rollout (low risk)
- **Phase 1:** crowd-derive peaks for the top 10k party songs (data only, no player change)
- **Phase 2:** crossfade / gapless engine in the player, gated to peak segments
- **Phase 3:** Party Mode toggle + group / social party sessions

### 13. The ask
I built a prototype and tested it at real parties.

I've been using Groovy at college dorm parties and frat parties. It works the energy stays
up. I have screen recordings of each transition: the song that ends, the song that starts,
and where the peaks land.

If this sounds interesting, I'd be happy to share the recordings or walk you through how it
works. I'm not pitching myself just the idea. If JioSaavn ships this, everyone wins.

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
