require('dotenv').config();
const { InferenceClient } = require('@huggingface/inference');

const client = new InferenceClient(process.env.HUGGINGFACE_API_KEY);

async function embedText(text) {
  const result = await client.featureExtraction({
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    inputs: text,
    provider: 'hf-inference'
  });
  return result;
}

module.exports = { embedText };