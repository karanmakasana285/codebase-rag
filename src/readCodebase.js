const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = ['node_modules', '.git'];
const IGNORE_FILES = ['package-lock.json'];
const VALID_EXTENSIONS = ['.js', '.jsx', '.md', '.json'];

function getAllFiles(dirPath, fileList = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.includes(entry.name)) {
        getAllFiles(fullPath, fileList);
      }
    } else {
      if (IGNORE_FILES.includes(entry.name)) continue;

      const ext = path.extname(entry.name);
      if (VALID_EXTENSIONS.includes(ext)) {
        fileList.push(fullPath);
      }
    }
  }

  return fileList;
}

function readCodebase(repoPath) {
  const filePaths = getAllFiles(repoPath);

  return filePaths.map(filePath => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      filePath,
      relativePath: path.relative(repoPath, filePath),
      content,
      lineCount: content.split('\n').length
    };
  });
}

module.exports = { readCodebase };