const EMBEDDING_MODEL = 'Xenova/multilingual-e5-large';
const EMBEDDING_DIMENSIONS = 1024;

export type QueryEmbedding = {
  vector: number[];
  model: string;
  prefix: 'query:';
  dimensions: 1024;
  normalized: true;
};

type FeatureExtractor = (
  text: string,
  options: { pooling: 'mean'; normalize: true },
) => Promise<{ data: ArrayLike<number> }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    // Load the native ONNX dependency only when RAG is actually requested.
    extractorPromise = import('@huggingface/transformers').then(({ pipeline }) =>
      pipeline('feature-extraction', EMBEDDING_MODEL, {
        device: 'cpu',
        dtype: 'q8',
      }) as unknown as Promise<FeatureExtractor>,
    );
  }

  return extractorPromise;
}

export async function generateLocalQueryEmbedding(queryText: string): Promise<QueryEmbedding> {
  const text = queryText.trim();
  if (!text) throw new Error('Query embedding kosong');

  const extractor = await getExtractor();
  const output = await extractor(`query: ${text}`, {
    pooling: 'mean',
    normalize: true,
  });
  const vector = Array.from(output.data, Number);

  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding query harus ${EMBEDDING_DIMENSIONS} dimensi, diterima ${vector.length}`);
  }

  return {
    vector,
    model: EMBEDDING_MODEL,
    prefix: 'query:',
    dimensions: 1024,
    normalized: true,
  };
}
