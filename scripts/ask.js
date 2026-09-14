const { answerQuestion } = require('../src/answerQuestion');
const { closeConnection } = require('../src/mongoVectorStore');

const QUESTION = process.argv[2];
const REPO_PATH = process.argv[3];

if (!QUESTION || !REPO_PATH) {
  console.error('Usage: node ask.js "your question" /path/to/repo');
  process.exit(1);
}

async function main() {
  console.log(`Question: ${QUESTION}\n`);
  console.log('Searching and generating answer...\n');

  const { answer, sourceChunks, expandedQuery } = await answerQuestion(QUESTION, REPO_PATH);

  console.log(`Expanded for retrieval: ${expandedQuery}\n`);

  console.log('=== ANSWER ===\n');
  console.log(answer);

  console.log('\n=== SOURCES ===');
  sourceChunks.forEach((chunk, i) => {
    console.log(`${i + 1}. ${chunk.filePath} (score: ${chunk.score.toFixed(4)})`);
  });

  await closeConnection();
}

main();