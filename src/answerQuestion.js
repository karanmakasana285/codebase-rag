require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const Groq = require('groq-sdk');
const { embedText } = require('./embedder');
const { vectorSearch } = require('./mongoVectorStore');
const { readCodebase } = require('./readCodebase');
const { extractSkeleton, formatSkeletonAsText } = require('./codebaseSkeleton');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let cachedGrounding = null;

function buildGrounding(repoPath) {
  if (cachedGrounding) return cachedGrounding;

  const files = readCodebase(repoPath);
  const readmeFile = files.find(f => f.relativePath.toLowerCase().includes('readme'));
  const skeleton = extractSkeleton(files);
  const skeletonText = formatSkeletonAsText(skeleton);

  const parts = [];
  if (readmeFile) {
    parts.push(`README:\n${readmeFile.content.slice(0, 800)}`);
  }
  if (skeletonText) {
    parts.push(`CODE STRUCTURE:\n${skeletonText}`);
  }

  cachedGrounding = parts.join('\n\n') || null;
  return cachedGrounding;
}

function isEnumerativeQuestion(question) {
  const enumerativeSignals = /\b(every|all|list|each|entire)\b/i;
  return enumerativeSignals.test(question);
}

function buildPrompt(question, chunks) {
  const context = chunks
    .map((chunk, i) => `[Chunk ${i + 1} — ${chunk.filePath}]\n${chunk.content}`)
    .join('\n\n---\n\n');

  return `You are answering questions about a specific codebase, using only the code context provided below. Answer based strictly on this context — do not guess or use outside knowledge about how such code "usually" works.

If the context doesn't contain enough information to answer confidently, say so explicitly rather than guessing.

CONTEXT:
${context}

QUESTION:
${question}

Answer clearly and specifically, referencing the relevant file(s) when helpful.`;
}

async function expandQuery(question, groundingContext) {
  if (!groundingContext) {
    return question;
  }

  const completion = await groq.chat.completions.create({
    messages: [{
      role: 'user',
      content: `Here is real information about this codebase (from its README and/or its actual code structure):

${groundingContext}

Rewrite the following question into a version optimized for finding relevant code. If the question contains parts that are genuinely unrelated to this codebase (e.g., comparisons to unrelated topics, people, or things outside software), do not force those parts into a code-related rewrite — leave them out of the rewrite, but do not invent code-related meaning for them either. Only rewrite the parts that genuinely relate to the codebase. Keep it to 2-3 sentences. Only return the rewritten question, nothing else.

Original question: ${question}`
    }],
    model: 'openai/gpt-oss-120b',
    temperature: 0.3
  });

  return completion.choices[0].message.content.trim();
}

async function answerQuestion(question, repoPath) {
  const groundingContext = buildGrounding(repoPath);
  const expandedQuery = await expandQuery(question, groundingContext);

  const topK = isEnumerativeQuestion(question) ? 20 : 8;

  const queryEmbedding = await embedText(expandedQuery);
  const chunks = await vectorSearch(queryEmbedding, topK);

  const prompt = buildPrompt(question, chunks);

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'openai/gpt-oss-120b',
    temperature: 0.2
  });

  return {
    answer: completion.choices[0].message.content,
    sourceChunks: chunks,
    expandedQuery,
    topK
  };
}

module.exports = { answerQuestion };