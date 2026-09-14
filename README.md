# Codebase RAG — Chat With Your Own Codebase

A Retrieval-Augmented Generation (RAG) pipeline that lets you ask natural-language questions about a codebase and get answers grounded in the actual source code — not guesses, not generic explanations, but retrieval-backed responses citing real files, functions, and logic.

Built against a real target project ([GitHub Issue Triage Agent](https://github.com/karanmakasana285/github-issue-triage-agent)) and rigorously tested across nine distinct question types — see [`RETRIEVAL_FINDINGS.md`](./RETRIEVAL_FINDINGS.md) for full test-by-test results, including exact questions asked, answers given, and retrieval scores.

## How it works

```
Codebase files (any local repo)
      ↓
Structure-aware chunking (by function/logical block for code, by header for Markdown)
      ↓
Embeddings generated per chunk (Hugging Face — all-MiniLM-L6-v2)
      ↓
Stored in MongoDB Atlas Vector Search
      ↓
User asks a question
      ↓
Query grounding + expansion (using the target repo's README + extracted function names, imports, and routes)
      ↓
Vector similarity search retrieves top-K relevant chunks
      ↓
Retrieved chunks + original question sent to an LLM (Groq)
      ↓
Answer generated, grounded in real retrieved code — with explicit instruction not to guess when context is insufficient
```

## Tech stack

- **Backend:** Node.js
- **Embeddings:** Hugging Face Inference API (`sentence-transformers/all-MiniLM-L6-v2`)
- **Vector store:** MongoDB Atlas Vector Search (cosine similarity)
- **LLM:** Groq (`openai/gpt-oss-120b`) — used both for query expansion and final answer generation
- **Chunking:** custom, structure-aware — JavaScript chunked by brace-depth/logical block boundaries, Markdown by header sections, JSON as a single unit

## Key engineering decisions

- **Structure-aware chunking, not naive text splitting.** Code is chunked by logical/function boundaries (tracked via brace depth) rather than fixed character counts, to avoid cutting functions in half and destroying their meaning. Verified directly against real output before trusting it — this process even surfaced a real formatting bug in the target repo's own README.

- **MongoDB Atlas Vector Search over a hand-rolled solution.** The project initially used a local JSON file with manually implemented cosine similarity, which worked and was validated correctly — then deliberately migrated to MongoDB Atlas Vector Search for production-realistic scale and to build on existing MongoDB experience. Both implementations were cross-checked and produced consistent rankings before the migration was trusted.

- **Grounded query expansion for vague questions.** Broad questions (e.g., "how does this even work") were found to under-retrieve specific implementation code, since vague phrasing shares little vocabulary with sparse code syntax. The fix — rewriting the question into something more specific before embedding — initially failed when implemented without any grounding: the LLM hallucinated unrelated concepts (e.g., "authentication middleware") that don't exist in the target codebase. The working fix grounds expansion in real facts extracted directly from the codebase: the project's README (when available) combined with function names, import statements, and route definitions extracted via lightweight pattern matching — so expansion works correctly even without relying on documentation being present or accurate. Full before/after results are documented in `RETRIEVAL_FINDINGS.md`.

- **Explicit anti-hallucination instruction in the generation prompt.** The LLM is directly instructed to say so explicitly, rather than guess, when retrieved context is insufficient to answer confidently. This was tested against fully unrelated questions and questions containing false premises about the codebase — both were correctly refused rather than answered with fabricated detail.

## Setup

1. Clone this repo and run `npm install`
2. Create a `.env` file:
   ```
   HUGGINGFACE_API_KEY=your_huggingface_token
   MONGODB_URI=your_mongodb_atlas_connection_string
   GROQ_API_KEY=your_groq_api_key
   ```
3. In MongoDB Atlas, create a database named `codebase-rag` with a collection named `chunks`, then create a Vector Search index named `vector_index` on the `embedding` field (384 dimensions, cosine similarity)
4. Build the index against a target codebase:
   ```
   node scripts/buildIndex.js /path/to/target/repo
   ```
5. Ask questions:
   ```
   node scripts/ask.js "your question here" /path/to/target/repo
   ```

## Project structure

```
src/          — core pipeline modules (reading, chunking, embedding, vector storage, Q&A logic)
scripts/      — runnable entry points (build index, ask questions, individual pipeline tests)
```

## Testing

Retrieval and answer quality were tested across nine distinct question types — vocabulary mismatch, cross-chunk synthesis, partial relevance, full irrelevance, vague/under-specified phrasing, precision/exact-fact questions, false-premise questions, and reasoning about untested behavior (e.g., correctly inferring concurrent-request handling from Node.js's execution model, without that behavior being explicitly documented anywhere). Full results, including exact questions, full answers, and retrieval scores, are in [`RETRIEVAL_FINDINGS.md`](./RETRIEVAL_FINDINGS.md).

## Future improvements

- **Cross-file/call-graph-aware retrieval** — currently, retrieval widens the number of chunks searched (top-K) to catch logic spread across a single file, but doesn't explicitly track which functions call which across *separate* files. This matters more for larger, multi-file projects, and is the next planned test target (see below).
- **Testing against a larger, multi-file codebase** — all current testing has been against a small, single-file project. The pipeline is designed to generalize (target repo path is parameterized, not hardcoded), and the next step is validating it against a significantly larger, multi-file real-world codebase.
- **Source citation in answers** — showing exactly which file/function line an answer's claim came from, for stronger trust and verifiability.
- **Confidence signaling based on retrieval score** — retrieval similarity scores were consistently higher for on-topic questions than unrelated ones across testing; this signal could be used to proactively flag low-confidence answers before generation, rather than relying solely on the LLM's own judgment.
- **Support for fetching a target repo directly via URL** (using the GitHub API), rather than requiring a local clone.