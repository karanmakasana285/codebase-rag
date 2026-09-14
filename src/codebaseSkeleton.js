function extractSkeleton(files) {
  const signals = [];

  files.forEach(file => {
    if (!file.relativePath.match(/\.(js|jsx)$/)) return;

    const content = file.content;

    const functionNames = [
      ...content.matchAll(/(?:function|const|let)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(|\()/g)
    ].map(m => m[1]);

    const imports = [
      ...content.matchAll(/require\(['"]([^'"]+)['"]\)/g)
    ].map(m => m[1]);

    const routes = [
      ...content.matchAll(/app\.(get|post|put|delete)\(['"]([^'"]+)['"]/g)
    ].map(m => `${m[1].toUpperCase()} ${m[2]}`);

    if (functionNames.length || imports.length || routes.length) {
      signals.push({
        file: file.relativePath,
        functions: [...new Set(functionNames)],
        imports: [...new Set(imports)],
        routes: [...new Set(routes)]
      });
    }
  });

  return signals;
}

function formatSkeletonAsText(signals) {
  return signals.map(s => {
    const parts = [`File: ${s.file}`];
    if (s.routes.length) parts.push(`  Routes: ${s.routes.join(', ')}`);
    if (s.functions.length) parts.push(`  Functions: ${s.functions.join(', ')}`);
    if (s.imports.length) parts.push(`  Imports: ${s.imports.join(', ')}`);
    return parts.join('\n');
  }).join('\n\n');
}

module.exports = { extractSkeleton, formatSkeletonAsText };