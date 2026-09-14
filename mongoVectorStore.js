require('dotenv').config();
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGODB_URI);
const DB_NAME = 'codebase-rag';
const COLLECTION_NAME = 'chunks';

let collectionInstance = null;

async function getCollection() {
  if (!collectionInstance) {
    await client.connect();
    const db = client.db(DB_NAME);
    collectionInstance = db.collection(COLLECTION_NAME);
  }
  return collectionInstance;
}

async function clearStore() {
  const collection = await getCollection();
  await collection.deleteMany({});
}

async function saveEntries(entries) {
  const collection = await getCollection();
  await collection.insertMany(entries);
}

async function vectorSearch(queryEmbedding, topK = 5) {
  const collection = await getCollection();

  const results = await collection.aggregate([
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: 100,
        limit: topK
      }
    },
    {
      $project: {
        content: 1,
        filePath: 1,
        type: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    }
  ]).toArray();

  return results;
}

async function closeConnection() {
  await client.close();
}

module.exports = { saveEntries, clearStore, vectorSearch, closeConnection };