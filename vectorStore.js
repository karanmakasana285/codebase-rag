const fs = require('fs');

const STORE_PATH = './vectorStore.json';

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function saveStore(entries) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(entries, null, 2));
}

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(STORE_PATH, 'utf-8');
  return JSON.parse(raw);
}

function search(queryEmbedding, entries, topK = 5) {
  const scored = entries.map(entry => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding)
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

module.exports = { saveStore, loadStore, search };