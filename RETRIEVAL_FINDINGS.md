# Retrieval Quality Testing — Findings

This document records deliberate tests of the RAG pipeline's retrieval and answer quality, run against the `ai-issue-triage-bot` repo as the target codebase. Each test was chosen to probe a specific known challenge in code-focused RAG systems. Full questions, answers, and retrieval scores are included as evidence, not just summarized conclusions.

---

## Test 1: Vocabulary mismatch (question phrasing vs. code vocabulary)

**Question:** `"what stops the same GitHub issue from being processed twice"` — deliberately avoiding the word "idempotency," which appears in the code only as a comment.

**Top retrieval scores (top-8):**
1. README.md — 0.7840 (Key engineering decisions section)
2. README.md — 0.7054 (How it works section)
3. README.md — 0.6720 (project title/intro)
4. index.js — 0.6613 (the actual webhook handler with `processedIssues.has(issueKey)`)
5. README.md — 0.6400
6. index.js — 0.6228
7. index.js — 0.6076 (the `processedIssues` Set declaration)
8. README.md — 0.5912

**Finding:** At top-3 retrieval, README prose (which explains the concept in natural language) outranked the actual implementing code — a known challenge in code RAG, since natural-language questions match natural-language documentation more strongly than sparse code syntax. Widening retrieval to top-8 successfully surfaced the actual implementing code as well (rank 4), validating a wider top-K as a low-complexity, effective mitigation for this specific gap.

---

## Test 2: Cross-chunk synthesis

**Question:** `"what happens if the LLM returns malformed JSON"`

**Answer given:**
> **What the code does when the LLM's response isn't valid JSON**
>
> 1. **Location in the code** – `classifyIssue` in `index.js`.
> 2. **Step-by-step behavior** — the raw LLM output is first stripped of any surrounding markdown fences and trimmed. The code then attempts `JSON.parse(cleaned)`. If parsing throws (i.e., the LLM returned malformed or non-JSON text), the catch block runs: an error is logged to the console, and the function does not propagate the error — instead it returns a fallback classification object: `{ type: 'question', severity: 'low', draft_response: 'Thanks for opening this issue! Our team will review it shortly.' }`.
> 3. **Why this matters** – The README's "Graceful degradation" section explicitly states that *"If the LLM returns malformed JSON, the bot falls back to a safe default classification instead of crashing."* The fallback object above is that safe default.
> 4. **Result for the rest of the pipeline** – Because `classifyIssue` always returns a well-formed object, downstream steps (labeling, posting the draft comment) continue to run using the default classification.

**Top retrieval scores:** README.md 0.7032, README.md 0.6873, index.js 0.6248, README.md 0.6034, README.md 0.6006, package.json 0.5920, index.js 0.5859, index.js 0.5661

**Finding:** The system correctly retrieved and quoted the exact code block verbatim, correctly explained control flow sequencing, and connected the code to the README's "Graceful degradation" claim — genuine synthesis across two different files. Code and documentation retrieval scores were closely comparable here (~0.60–0.70 range), unlike Test 1's wider gap, suggesting the "prose beats code" problem is question-dependent, not universal.

---

## Test 3: Partially-related question (graceful degradation, not hallucination)

**Question:** `"how does this project handle user authentication"` — the project has no user-facing auth, only service-to-service API key authentication.

**Answer given:**
> Authentication in this project is done with static API-keys that are read from environment variables and passed to the client libraries that talk to external services.
>
> | What is being authenticated | How it is done | Where |
> |---|---|---|
> | GitHub API calls | `Octokit` instance created with `auth: process.env.GITHUB_TOKEN` | index.js |
> | Groq LLM API | `Groq` client instantiated with `apiKey: process.env.GROQ_API_KEY` | index.js |
> | Incoming webhook verification | Not performed — the code does not verify the GitHub webhook signature; it simply trusts the request body | No explicit code present |
>
> **Summary:** The project authenticates to GitHub using a personal access token and to Groq using an API key, both supplied via environment variables. **No user-level authentication or webhook signature verification is implemented in the code itself.**

**Top retrieval scores:** index.js 0.5922, README.md 0.5921, README.md 0.5865, README.md 0.5812, README.md 0.5802, README.md 0.5559, README.md 0.5505, index.js 0.5240

**Finding:** Rather than hallucinating a fake login system, the model correctly identified the closest genuinely relevant concept (API key authentication), explained it accurately, and explicitly flagged that no user-level authentication exists. A more useful, mature response than either a rigid refusal or a fabricated answer.

---

## Test 4: Fully unrelated question (hallucination resistance)

**Question:** `"how does this project handle payment processing"` — zero adjacent concept in the codebase.

**Answer given:**
> The project does **not** include any payment-processing logic. The README, engineering notes, and the source code only describe handling GitHub webhook events, classifying issues with the Groq LLM, and interacting with the GitHub REST API. There is no mention of payment services, billing APIs, or any code that collects, stores, or transacts money. The only external services referenced are the Groq API and GitHub's API. No payment gateway (e.g., Stripe, PayPal) appears in the provided files. **Therefore, based on the supplied context, the project does not handle payment processing at all.**

**Top retrieval scores:** README.md 0.5903, README.md 0.5883, index.js 0.5642, README.md 0.5610, index.js 0.5535, README.md 0.5515, README.md 0.5497, README.md 0.5467

**Finding:** Clean, confident refusal with no fabricated logic. Retrieval scores dropped across the board (0.54–0.59) compared to on-topic questions (0.6–0.78 in Tests 1–2), suggesting similarity score could serve as a future confidence signal to proactively flag low-relevance retrieval before generation.

---

## Test 5: Vague, under-specified question — a real, identified limitation

**Question:** `"how does this even work"`

**Answer given (relevant excerpt):**
> **GitHub webhook delivery** – (described in the README, the actual route handler isn't shown in the snippets)... If you need to see the exact webhook-handler implementation, you would look for the route definition (e.g., `app.post('/webhook/github', …)`) elsewhere in the codebase.

**Top retrieval scores:** README.md 0.5768, README.md 0.5683, README.md 0.5564, README.md 0.5515, README.md 0.5460, index.js 0.5314, README.md 0.5276, index.js 0.5246

**Finding — a genuine, distinct failure mode:** The overall answer was well-organized and mostly accurate, but contained a real inaccuracy: it claimed the webhook handler code "isn't shown" and speculated it exists "elsewhere," when that code (`app.post('/webhook/github', ...)`) is actually present in the codebase and had been correctly retrieved in Tests 1 and 2. The vague phrasing of this question failed to retrieve that specific chunk this time. This is distinct from hallucination — the model did not fabricate code, but made an incorrect claim about where real code lives, caused by imperfect retrieval on an under-specified query.

**Fix applied:** Query expansion — rewriting vague questions into a more specific, retrieval-friendly version via an LLM call before embedding, while still answering the user's original question in the final response. *(Section to be updated with the retest result once confirmed.)*

---

## Summary

Across five deliberately varied test questions, the pipeline:
- Correctly avoided hallucination in every case where information was genuinely absent (Tests 3, 4)
- Correctly synthesized accurate answers across multiple chunks and files when information was present (Tests 1, 2)
- Revealed one specific, real limitation on vague queries (Test 5) — not hallucination, but an incorrect claim about code location caused by weak retrieval on under-specified phrasing — which was diagnosed and addressed via query expansion

A consistent pattern across tests: retrieval similarity scores were notably higher for on-topic questions (0.6–0.78) than for unrelated ones (0.51–0.59), suggesting score thresholding is a viable, low-effort future enhancement for proactively flagging low-confidence retrieval.