const OVERSIZE_TRIGGER_LINES = 80;
const MIN_SUBCHUNK_LINES = 15;
const TARGET_SUBCHUNK_LINES = 40;
const HARD_MAX_SUBCHUNK_LINES = 60;

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

function subSplitOversizedChunk(chunk) {
  const lines = chunk.content.split('\n');
  if (lines.length <= OVERSIZE_TRIGGER_LINES) return [chunk];

  const boundaryPattern = /^\s*(const|let|function|export default function|return\s*\()/;
  const subChunks = [];
  let current = [];
  let depth = 0;
  let startLineOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const currentSize = current.length;
    const atSafeDepth = depth <= 1;
    const isBoundary = boundaryPattern.test(line) && atSafeDepth;

    const shouldCutAtBoundary = isBoundary && currentSize >= MIN_SUBCHUNK_LINES;
    const shouldCutAtTarget = currentSize >= TARGET_SUBCHUNK_LINES && atSafeDepth;
    const mustCutHardMax = currentSize >= HARD_MAX_SUBCHUNK_LINES;

    const shouldCut = (shouldCutAtBoundary || shouldCutAtTarget || mustCutHardMax) &&
      current.some(l => l.trim() !== '');

    if (shouldCut) {
      subChunks.push({
        ...chunk,
        content: current.join('\n').trim(),
        startLine: (chunk.startLine || 1) + startLineOffset,
        endLine: (chunk.startLine || 1) + i - 1,
        subChunk: true
      });
      current = [];
      startLineOffset = i;
    }

    current.push(line);

    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    depth += openBraces - closeBraces;
  }

  if (current.some(l => l.trim() !== '')) {
    subChunks.push({
      ...chunk,
      content: current.join('\n').trim(),
      startLine: (chunk.startLine || 1) + startLineOffset,
      endLine: chunk.endLine,
      subChunk: true
    });
  }

  return subChunks.length > 1 ? subChunks : [chunk];
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

  const withSubSplitting = chunks.flatMap(chunk =>
    (chunk.type === 'code') ? subSplitOversizedChunk(chunk) : [chunk]
  );

  return withSubSplitting.filter(chunk => chunk.content.trim().length > 0);
}

module.exports = { chunkFile };