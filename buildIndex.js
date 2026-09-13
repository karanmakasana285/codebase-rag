const { readCodebase } = require('./readCodebase');
const { chunkFile } = require('./chunker');
const { embedText } = require('./embedder');
const { saveStore } = require('./vectorStore');

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

  saveStore(entries);
  console.log(`\nDone. Indexed ${entries.length} chunks into vectorStore.json`);
}

buildIndex();