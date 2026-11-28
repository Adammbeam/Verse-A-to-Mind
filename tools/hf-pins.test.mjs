import test from 'node:test';
import assert from 'node:assert/strict';
import { readPin, verify, derive, cells, root } from './hf-pins.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('a pinned Hugging Face dataset is vendored with its own licence and used offline', () => {
  const pin = readPin();
  assert.equal(pin.library.id, 'huggingface/datasets');
  assert.equal(pin.library.license, 'Apache-2.0'); // the library's licence is not a licence for every dataset in it
  assert.equal(pin.datasets.length, 1);
  const d = pin.datasets[0];
  assert.equal(d.id, 'AWeirdDev/airports');
  assert.equal(d.license, 'MIT'); // checked on the dataset card, not inherited from the library
  assert.deepEqual(verify(pin), []);
  const data = JSON.parse(readFileSync(resolve(root, d.derived), 'utf8'));
  assert.equal(data.pin, d.commit);
  assert.equal(data.pinSha256, d.fileSha256);
  assert.equal(data.license, 'MIT');
  assert.equal(data.airports.length, 24);
  assert.match(data.note, /no request is made to huggingface\.co at runtime/);
  assert.deepEqual(data.airports.find((a) => a.code === 'LHR'), { code: 'LHR', tz: 'Europe/London', name: 'London Heathrow Airport', city: 'West Drayton', country: 'GB', icao: 'EGLL' });
});

test('the reduction refuses a CSV that lost a pinned row, and the page names the licence beside the pin', () => {
  const d = readPin().datasets[0];
  const csv = '"code","time_zone_id","name","city_code","country_id","location","elevation","url","icao","city","county","state"\nLHR,Europe/London,Heathrow,LHR,GB,POINT (0 0),0,,EGLL,West Drayton,,\n';
  assert.deepEqual(cells('a,"b,b",c'), ['a', 'b,b', 'c']);
  assert.throws(() => derive(csv, d, d.fileSha256), /the pinned CSV lost/);
  const page = readFileSync(resolve(root, 'void-live-deploy/flights/index.html'), 'utf8');
  assert.match(page, /pinned, MIT-licensed Hugging Face dataset/, 'the flights page says where the checked data came from');
});
