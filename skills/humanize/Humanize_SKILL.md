---
name: humanize
description: >
  Rewrite text to sound direct, punchy, and authentically human. Use this skill
  whenever the user asks to "humanize," "de-AI," "make this sound human," "make
  this less robotic," "rewrite naturally," or pastes text that reads like AI output
  and asks for improvements. Also trigger when the user says "this sounds like
  ChatGPT," "too formal," "too stiff," "sounds fake," or "make it punchier." Apply
  even when the user just says "clean this up" or "edit this" if the input text
  shows obvious AI writing patterns (rule of three, em dash overuse, hedging,
  performed authenticity).
---

# Humanize Skill

Rewrite text to sound direct, punchy, and authentically human by following the
rules below. Apply all rules together — don't just fix one thing. Return only
the rewritten text unless the user asks for explanation.

## 1. Vocabulary Kill List

Delete or replace these words on sight:

**Significance indicators** (delete or rephrase): testament to, pivotal,
underscores, highlights, represents a shift, reflects broader trends, stands as

**Flowery filler** (delete or use plain alternatives): vibrant, rich, stunning,
nestled in the heart of, boasts a, tapestry, delve, unlock

**Formal crutches** (just delete them): notably, significantly, crucially,
it is worth noting

## 2. Break Structural AI Patterns

**Rule of Three → Two or Four.** AI defaults to lists of exactly three. Change
them. Two items = punchy. Four = thorough.

- Before: "It was efficient, reliable, and innovative."
- After: "It was efficient and reliable." or "It was efficient, reliable,
  cost-effective, and easy to use."

**Kill the "-ing" Tail.** AI ends sentences with present participles. Make them
active instead.

- Before: "...creating a sense of community."
- After: "...this creates a real community."

**Sentence Burstiness.** Vary sentence length aggressively. Short sentences hit
hard. Follow them with a longer one that gives context or adds nuance. Don't let
every sentence run the same length — it's the clearest tell that something was
AI-written.

**Limit Em Dashes.** Replace em dashes with periods. Two clauses become two
sentences.

- Before: "The project succeeded — despite the setbacks."
- After: "The project succeeded. The setbacks didn't stop it."

## 3. Remove Performed Authenticity

**Delete meta-talk:** In conclusion, To summarize, At the end of the day,
In today's world

**Skip the preamble:** Cut opener phrases that delay the point.

- Delete: "I understand how important this is", "Let's explore the reasons why",
  "It goes without saying that"

**Show, don't tell:** Replace vague significance claims with a specific detail.

- Before: "a testament to modern engineering"
- After: "held together by 4,000 hand-tightened bolts"

## 4. Eliminate Hedging

Remove weasel words: perhaps, arguably, some might say, potentially, it depends,
it could be said

Don't do the "on one hand / on the other hand" balance act unless the user
specifically needs a balanced view. State things directly.

## 5. Polish

**Use contractions:** don't, won't, can't, it's, that's, they're — formal
uncontracted versions sound stiff.

**De-clutter bolding:** Remove bold from keywords mid-sentence. Bold is for
headers or the single most critical term only.

**Plain words:** If a word has three syllables, try a one-syllable version first.

- "utilize" → "use"
- "approximately" → "about"
- "demonstrate" → "show"
- "facilitate" → "help"
- "implement" → "build" or "use"
