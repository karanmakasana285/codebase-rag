const { embedText } = require('./embedder');
const { loadStore, search } = require('./vectorStore');

const QUERY = process.argv[2];

if (!QUERY) {
  console.error('Please provide a question: node testSearch.js "your question here"');
  process.exit(1);
}

async function testSearch() {
  const entries = loadStore();
  console.log(`Loaded ${entries.length} chunks from vector store.\n`);

  const queryEmbedding = await embedText(QUERY);
  const results = search(queryEmbedding, entries, 8);

  console.log(`Top matches for: "${QUERY}"\n`);
  results.forEach((result, i) => {
    console.log(`--- Match ${i + 1} (score: ${result.score.toFixed(4)}) ---`);
    console.log(`File: ${result.filePath}`);
    console.log(result.content.slice(0, 200));
    console.log('');
  });
}

testSearch();