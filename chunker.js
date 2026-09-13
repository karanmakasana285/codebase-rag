function chunkJavaScript(content, relativePath) {
  const lines = content.split('\n');
  const chunks = [];
  let currentChunk = [];
  let braceDepth = 0;
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;

    const isBlankLine = line.trim() === '';
    const atTopLevel = braceDepth === 0;

    if (isBlankLine && atTopLevel && currentChunk.some(l => l.trim() !== '')) {
      chunks.push({
        content: currentChunk.join('\n').trim(),
        filePath: relativePath,
        startLine,
        endLine: i,
        type: 'code'
      });
      currentChunk = [];
      startLine = i + 2;
    } else {
      currentChunk.push(line);
    }

    braceDepth += openBraces - closeBraces;
  }

  if (currentChunk.some(l => l.trim() !== '')) {
    chunks.push({
      content: currentChunk.join('\n').trim(),
      filePath: relativePath,
      startLine,
      endLine: lines.length,
      type: 'code'
    });
  }

  return chunks;
}

function chunkMarkdown(content, relativePath) {
  const lines = content.split('\n');
  const sections = [];
  let currentSection = [];

  for (const line of lines) {
    const isHeader = /^#{1,3}\s/.test(line);

    if (isHeader && currentSection.length > 0) {
      sections.push(currentSection.join('\n'));
      currentSection = [line];
    } else {
      currentSection.push(line);
    }
  }

  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n'));
  }

  return sections.map((section, index) => ({
    content: section.trim(),
    filePath: relativePath,
    startLine: null,
    endLine: null,
    type: 'markdown',
    sectionIndex: index
  }));
}

function chunkJSON(content, relativePath) {
  return [{
    content: content.trim(),
    filePath: relativePath,
    startLine: 1,
    endLine: content.split('\n').length,
    type: 'json'
  }];
}

function chunkFile(fileObj) {
  const ext = fileObj.relativePath.split('.').pop();
  let chunks;

  if (ext === 'js' || ext === 'jsx') {
    chunks = chunkJavaScript(fileObj.content, fileObj.relativePath);
  } else if (ext === 'md') {
    chunks = chunkMarkdown(fileObj.content, fileObj.relativePath);
  } else if (ext === 'json') {
    chunks = chunkJSON(fileObj.content, fileObj.relativePath);
  } else {
    chunks = [{
      content: fileObj.content,
      filePath: fileObj.relativePath,
      startLine: 1,
      endLine: fileObj.lineCount,
      type: 'unknown'
    }];
  }

  return chunks.filter(chunk => chunk.content.trim().length > 0);
}

module.exports = { chunkFile };