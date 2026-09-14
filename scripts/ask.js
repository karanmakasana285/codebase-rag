const { answerQuestion } = require('../src/answerQuestion');
const { closeConnection } = require('../src/mongoVectorStore');

const QUESTION = process.argv[2];

if (!QUESTION) {
  console.error('Please provide a question: node ask.js "your question here"');
  process.exit(1);
}

async function main() {
  console.log(`Question: ${QUESTION}\n`);
  console.log('Searching and generating answer...\n');

  const { answer, sourceChunks } = await answerQuestion(QUESTION);

  console.log('=== ANSWER ===\n');
  console.log(answer);

  console.log('\n=== SOURCES ===');
  sourceChunks.forEach((chunk, i) => {
    console.log(`${i + 1}. ${chunk.filePath} (score: ${chunk.score.toFixed(4)})`);
  });

  await closeConnection();
}

main();