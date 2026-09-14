const { readCodebase } = require('../src/readCodebase');
const { chunkFile } = require('../src/chunker');
const { embedText } = require('../src/embedder');
const { saveEntries, clearStore, closeConnection } = require('../src/mongoVectorStore');

const TARGET_REPO_PATH = process.argv[2];

if (!TARGET_REPO_PATH) {
  console.error('Please provide a repo path: node buildIndex.js /path/to/repo');
  process.exit(1);
}

async function buildIndex() {
  const files = readCodebase(TARGET_REPO_PATH);

  let allChunks = [];
  files.forEach(file => {
    const chunks = chunkFile(file);
    allChunks = allChunks.concat(chunks);
  });

  console.log(`Embedding ${allChunks.length} chunks...`);

  const entries = [];
  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    console.log(`  [${i + 1}/${allChunks.length}] ${chunk.filePath}`);
    const embedding = await embedText(chunk.content);
    entries.push({
      ...chunk,
      embedding
    });
  }

  console.log('Clearing old entries in MongoDB...');
  await clearStore();

  console.log('Saving new entries to MongoDB...');
  await saveEntries(entries);

  console.log(`\nDone. Indexed ${entries.length} chunks into MongoDB Atlas Vector Search.`);
  await closeConnection();
}

buildIndex();