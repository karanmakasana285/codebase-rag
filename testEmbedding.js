const { embedText } = require('./embedder');

async function main() {
  const text = "This function handles idempotency for webhook processing.";
  const embedding = await embedText(text);

  console.log(`Embedding generated. Vector length: ${embedding.length}`);
  console.log(`First 5 values: ${embedding.slice(0, 5)}`);
}

main();