require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const Groq = require('groq-sdk');
const { embedText } = require('./embedder');
const { vectorSearch } = require('./mongoVectorStore');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

async function answerQuestion(question, topK = 8) {
  const queryEmbedding = await embedText(question);
  const chunks = await vectorSearch(queryEmbedding, topK);

  const prompt = buildPrompt(question, chunks);

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'openai/gpt-oss-120b',
    temperature: 0.2
  });

  return {
    answer: completion.choices[0].message.content,
    sourceChunks: chunks
  };
}

module.exports = { answerQuestion };