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

**Fix applied — three iterations, each diagnosing a deeper problem:**

1. **First attempt: ungrounded query expansion.** Asked an LLM to rewrite the vague question into something more specific, with no information about the actual codebase. Result: the LLM hallucinated an unrelated domain — the expanded query asked about "authentication middleware" and "token extraction," concepts that don't exist anywhere in this project. This revealed that query expansion without grounding introduces its own hallucination risk, distinct from the generation-stage hallucination tested in Tests 3, 4, and 6.

2. **Second attempt: grounding via a preliminary vector search.** Proposed running a quick retrieval on the raw question first, using those chunks as grounding context for expansion. Rejected before implementation: this is circular — a vague question that retrieves poorly for the real search would retrieve poorly for the orientation search too, since both use the same underlying similarity search.

3. **Final fix: grounding via README + extracted code structure.** Built a lightweight, regex-based extractor (`src/codebaseSkeleton.js`) that pulls real function names, import statements, and route definitions directly from the source code, combined with the project's README when available. This grounding is independent of retrieval quality (solving the circularity problem) and independent of documentation accuracy or existence (solving the "no README" and "stale README" cases) — a function literally named `classifyIssue` or a route literally defined as `app.post('/webhook/github', ...)` cannot be wrong the way prose documentation can.

**Result after the final fix**, same question, re-run:

**Expanded query:** *"How does the `POST /webhook/github` route process an incoming issue event to classify the issue using the Groq LLM and then apply labels and a comment via the GitHub API? Specifically, which functions in `index.js` handle the request parsing, the call to `classifyIssue`, and the subsequent Octokit calls?"*

**Retrieval scores jumped substantially** — 0.6787–0.8722, compared to 0.5246–0.5768 on the original ungrounded attempt. The webhook handler, the `classifyIssue` function, and the client-setup chunks were all retrieved with strong scores.

**The answer no longer claims any code is missing.** It correctly and specifically walks through the entire request flow in order — idempotency check, data extraction, LLM classification, JSON parsing with fallback, label application with error handling, comment posting — citing real code (`if (processedIssues.has(issueKey))`, `octokit.rest.issues.addLabels`) throughout, with no fabricated or misattributed claims about where code lives.

---

---

## Test 6: Precision test — exact technical detail

**Question:** `"what exact HTTP status code does the bot return when a webhook is a duplicate"`

**Expanded query:** *"In the Express server's `POST /webhook/github` handler, what HTTP status code is returned when the incoming webhook is identified as a duplicate? Please reference the specific response sent for duplicate webhook events."*

**Answer given:**
> The bot replies with **HTTP 200 OK** for a duplicate webhook. In `index.js` (the webhook handler), the code checks the in-memory `processedIssues` set:
> ```javascript
> if (processedIssues.has(issueKey)) {
>   console.log(`Issue ${issueKey} already processed, skipping duplicate webhook`);
>   return res.status(200).send('Already processed');
> }
> ```
> When the issue key is already present, the handler immediately returns `res.status(200)`. Therefore the exact status code sent for a duplicate webhook delivery is **200**.

**Top retrieval scores:** index.js 0.7922, README.md 0.7781, README.md 0.7456, README.md 0.7095, README.md 0.6984, index.js 0.6315, README.md 0.6300, index.js 0.6243

**Finding:** Correct, exact, and precisely cited — no hedging or padding on a question demanding a single verifiable fact. Notably, `index.js`'s webhook chunk ranked #1 here, ahead of any README chunk — unlike Test 1's broader idempotency question. This suggests a sharper pattern than "documentation beats code": questions phrased in precise, technical vocabulary (e.g., "HTTP status code") retrieve code competitively or better, while questions phrased in broad natural language favor documentation prose. This refines Test 1 and Test 2's findings into a more specific, defensible claim about *when* the prose-vs-code retrieval gap actually appears.

---

## Test 7: False-premise question

**Question:** `"why does this project use Redis for caching the classification results"` — the project does not use Redis anywhere; the question assumes something untrue.

**Expanded query:** *"Where in the codebase is the caching of issue classification results implemented, and what mechanism or library is used for that caching?"*

**Answer given:**
> The code and documentation you've provided do **not** show any use of Redis for caching classification results.
> - Idempotency is handled with an in-memory "processed-issues" tracker, not Redis.
> - The only external services referenced are the Groq API and the GitHub API (via Octokit).
> - The `classifyIssue` function parses the LLM response and, on failure, falls back to a hard-coded default — there is no caching layer shown.
> - The setup instructions mention no Redis provisioning or client configuration.
>
> Because none of the supplied files import or instantiate a Redis client, nor is Redis mentioned anywhere in the architecture description, the project does **not** use Redis for caching classification results.

**Top retrieval scores:** README.md 0.7318, README.md 0.6714, README.md 0.6371, README.md 0.5993, README.md 0.5961, index.js 0.5515, README.md 0.5497, index.js 0.5494

**Finding:** This is a meaningfully harder test than Tests 3 and 4 (which asked about genuinely absent features without assuming anything false about existing ones) — here the question presupposes a specific, plausible-sounding implementation detail (Redis caching) that doesn't exist. The system correctly rejected the false premise rather than attempting to helpfully explain a feature that was never built, and — notably — it didn't just say "no," it actively justified the refusal with specific supporting evidence (no imports, no client instantiation, no setup steps), producing a more trustworthy refusal than a bare denial.

---

---

## Test 8: Reasoning beyond retrieved text — inferring untested behavior

**Question:** `"what would happen if two GitHub webhook deliveries for the same issue arrived at literally the same moment"` — this behavior is never explicitly described anywhere in the code or README; answering it correctly requires reasoning about Node.js's execution model, not just retrieving and restating existing text.

**Expanded query:** *"How does the `POST /webhook/github` endpoint handle multiple webhook deliveries for the same issue arriving simultaneously? Does the code implement any deduplication, locking, or idempotency checks to prevent the issue from being classified and labeled twice?"*

**Answer given:**
> The idempotency check is performed synchronously right at the top of the handler:
> ```js
> const issueKey = `${owner}/${repo}#${issueNumber}`;
> if (processedIssues.has(issueKey)) {
>   console.log(`Issue ${issueKey} already processed, skipping duplicate webhook`);
>   return res.status(200).send('Already processed');
> }
> processedIssues.add(issueKey);
> ```
> Node's event loop processes the two HTTP requests one after the other, even if they arrived "at the same moment." The first request that gets scheduled will execute the `if` check, find the key absent, and immediately execute `processedIssues.add(issueKey)` — all synchronously, before any asynchronous work (classification, labeling, commenting) begins. When the second request's handler runs, the set already contains the key, so it's short-circuited with `200 OK` / "Already processed."
>
> **Result:** Only one of the deliveries proceeds to classification and labeling; the other is ignored, preventing duplicate work — because the idempotency guard is checked and updated synchronously before any async work begins, with no gap where two requests could both pass the check simultaneously.

**Top retrieval scores:** README.md 0.8171, README.md 0.7697, index.js 0.7298, README.md 0.6784, README.md 0.6720, README.md 0.6529, README.md 0.6306, index.js 0.6216

**Finding:** This is a qualitatively harder test than the earlier synthesis test (Test 2), because no chunk anywhere states what happens under truly concurrent requests — the model had to correctly reason about JavaScript's single-threaded, synchronous execution model, specifically that the `has()` check and `add()` call happen with no `await` between them, leaving no window for two requests to interleave before one claims the key. This is a subtle, easy-to-get-wrong point (a less careful analysis might assume concurrent requests are inherently racy) that the model reasoned through correctly, using retrieved code as grounding but going beyond what any single chunk states outright. This demonstrates the pipeline can support genuine reasoning about code behavior, not just retrieval-and-restatement.

---

## Summary

Across eight deliberately varied test questions, the pipeline:
- Correctly avoided hallucination in every case where information was genuinely absent (Tests 3, 4) or where a question assumed something false (Test 7)
- Correctly synthesized accurate answers across multiple chunks and files when information was present (Tests 1, 2), including precise, single-fact technical questions (Test 6)
- Demonstrated genuine reasoning beyond retrieved text — correctly inferring untested concurrent behavior from Node.js's execution model, not just retrieving and restating existing content (Test 8)
- Revealed one specific, real limitation on vague queries (Test 5) — not hallucination, but an incorrect claim about code location caused by weak retrieval on under-specified phrasing — which was diagnosed and addressed via grounded query expansion, with a documented before/after comparison
- Refined the initial "documentation beats code in retrieval" finding (Test 1) into a more precise claim: broad, natural-language questions favor documentation prose, while precise, technically-worded questions (Test 6) retrieve code competitively or better

A consistent pattern across tests: retrieval similarity scores were notably higher for on-topic, well-grounded questions (0.6–0.87) than for unrelated or false-premise ones (0.51–0.73), suggesting score thresholding is a viable, low-effort future enhancement for proactively flagging low-confidence retrieval.

**Known open item:** a completeness test (asking the system to list every environment variable the project requires) returned a confidently-stated but incomplete answer — it correctly identified `GITHUB_TOKEN` and `GROQ_API_KEY` but omitted `PORT`, while still claiming full completeness. This is being investigated further before being added here, since it represents a distinct and important failure mode (confident incompleteness, not incorrectness) worth documenting carefully rather than summarizing hastily.
