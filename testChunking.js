const { readCodebase } = require('./readCodebase');
const { chunkFile } = require('./chunker');

const TARGET_REPO_PATH = process.argv[2];

if (!TARGET_REPO_PATH) {
  console.error('Please provide a repo path: node testChunking.js /path/to/repo');
  process.exit(1);
}

const files = readCodebase(TARGET_REPO_PATH);

let totalChunks = 0;

files.forEach(file => {
  const chunks = chunkFile(file);
  totalChunks += chunks.length;

  console.log(`\n=== ${file.relativePath} — ${chunks.length} chunks ===`);
  chunks.forEach((chunk, i) => {
    console.log(`\n--- Chunk ${i + 1} (lines ${chunk.startLine}-${chunk.endLine}) ---`);
    console.log(chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : ''));
  });
});

console.log(`\n\nTotal chunks across all files: ${totalChunks}`);