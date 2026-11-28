// a-to-mind.com/embeddings/: one Transformers.js task, loaded only when someone presses Compare.
// Nothing is sent to a Verse worker: the text and the model stay in this browser tab.
import { similarity } from './embed-core.js';

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
const MODEL = 'Xenova/all-MiniLM-L6-v2';
let extractor = null;

const load = async () => {
  if (!extractor) {
    const { pipeline } = await import(/* webpackIgnore: true */ LIBRARY);
    extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  }
  return extractor;
};

export async function compare(a, b) {
  const pipe = await load();
  const vectors = (await pipe([a, b], { pooling: 'mean', normalize: true })).tolist();
  return { score: similarity(vectors[0], vectors[1]), dimensions: vectors[0].length };
}

const form = document.getElementById('compare-form');
if (form) {
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const a = document.getElementById('sentence-a').value.trim();
    const b = document.getElementById('sentence-b').value.trim();
    if (!a || !b) { status.textContent = 'Type two sentences first.'; result.hidden = true; return; }
    const button = form.querySelector('button');
    button.disabled = true;
    status.textContent = extractor ? 'Comparing on this device…' : 'Loading the small model on this device (once)…';
    try {
      const { score, dimensions } = await compare(a, b);
      status.textContent = 'Written on this device. Your sentences were not sent to a-to-mind.com.';
      document.getElementById('score').textContent = score.toFixed(3);
      document.getElementById('dimensions').textContent = String(dimensions);
      result.hidden = false;
    } catch (error) {
      status.textContent = 'The model could not run here: ' + (error && error.message ? error.message : String(error));
      result.hidden = true;
    } finally {
      button.disabled = false;
    }
  });
}

// a small handle for the browser check; it never loads the model by itself.
window.verseEmbeddings = { compare, ready: () => !!extractor, library: LIBRARY, model: MODEL };
