const { embedText } = require('../src/embedder');
const { vectorSearch, closeConnection } = require('../src/mongoVectorStore');

const QUERY = process.argv[2];

if (!QUERY) {
  console.error('Please provide a question: node testSearch.js "your question here"');
  process.exit(1);
}

async function testSearch() {
  const queryEmbedding = await embedText(QUERY);
  const results = await vectorSearch(queryEmbedding, 8);

  console.log(`Top matches for: "${QUERY}"\n`);
  results.forEach((result, i) => {
    console.log(`--- Match ${i + 1} (score: ${result.score.toFixed(4)}) ---`);
    console.log(`File: ${result.filePath}`);
    console.log(result.content.slice(0, 200));
    console.log('');
  });

  await closeConnection();
}

testSearch();