// The wide banner that opens the book's "How to ask" page (page 2). It shows what the page says in a
// single, text-free schematic: the ask bar at the foot projects a thin arc into three things on the
// stage: a card, a draggable dial, and a grid board. Drawn as an inline SVG (1200 x 400, 3:1) in
// sepia-charcoal line work over the parchment (no border, no fill plate, no embedded text), so it
// stays crisp at any width and works offline. Pure.
const W = 1200, H = 400;

export function howToAskBanner() {
  const ink = 'rgba(180,200,230,0.25)'; // the book's one schematic hairline colour (tools/book-art.mjs: strokes only, no fills)
  const stroke = (w = 2.4, op = 0.72, cap = 'round') => 'stroke="' + ink + '" stroke-width="' + w + '" stroke-opacity="' + op + '" fill="none" stroke-linecap="' + cap + '" stroke-linejoin="round"';
  // ask bar -> three arcs -> three silhouettes
  const beams = [
    'M600 318C520 278 430 236 332 198',
    'M600 318C600 284 600 246 600 206',
    'M600 318C680 278 770 236 868 198',
  ];
  // dial ticks (12)
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6, r0 = 56, r1 = i % 3 === 0 ? 46 : 49;
    ticks += '<line x1="' + (600 + Math.cos(a) * r0).toFixed(1) + '" y1="' + (150 + Math.sin(a) * r0).toFixed(1) + '" x2="' + (600 + Math.cos(a) * r1).toFixed(1) + '" y2="' + (150 + Math.sin(a) * r1).toFixed(1) + '" ' + stroke(i % 3 === 0 ? 2.2 : 1.4, 0.5) + '/>';
  }
  // board grid (4x4)
  let grid = '';
  for (let i = 1; i < 4; i++) {
    const x = 810 + i * 36, y = 110 + i * 24;
    grid += '<line x1="' + x + '" y1="110" x2="' + x + '" y2="206" ' + stroke(1.4, 0.35) + '/>';
    grid += '<line x1="810" y1="' + y + '" x2="954" y2="' + y + '" ' + stroke(1.4, 0.35) + '/>';
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" class="vc-art-svg tome-portal-svg" viewBox="0 0 1200 400" width="1200" height="400" preserveAspectRatio="xMidYMid meet" role="img" aria-label="How to ask: the ask bar at the foot sends an arc up to a card, a draggable dial, and a grid board">'
    + '<g ' + stroke(2.2, 0.55) + '>'
    // arcs from the ask bar
    + beams.map((d) => '<path d="' + d + '" ' + stroke(1.8, 0.38) + '/>').join('')
    // card silhouette (left)
    + '<g transform="translate(260 78) rotate(-6 72 76)">'
    +   '<rect x="0" y="0" width="144" height="152" rx="10" ' + stroke(2.4, 0.6) + '/>'
    +   '<line x1="22" y1="28" x2="82" y2="28" ' + stroke(2.2, 0.4) + '/>'
    +   '<line x1="22" y1="46" x2="58" y2="46" ' + stroke(2.0, 0.32) + '/>'
    +   '<rect x="22" y="68" width="100" height="58" rx="6" ' + stroke(1.8, 0.35) + '/>'
    + '</g>'
    // draggable dial (center)
    + '<g>'
    +   '<circle cx="600" cy="150" r="58" ' + stroke(2.4, 0.6) + '/>'
    +   '<circle cx="600" cy="150" r="40" ' + stroke(1.6, 0.28) + '/>'
    +   ticks
    +   '<line x1="600" y1="150" x2="632" y2="122" ' + stroke(2.6, 0.6) + '/>'
    +   '<circle cx="600" cy="150" r="6" ' + stroke(2.0, 0.55) + '/>'
    +   '<circle cx="632" cy="122" r="5" fill="none" ' + stroke(1.6, 0.45) + '/>'
    + '</g>'
    // grid board (right)
    + '<g transform="translate(810 110)">'
    +   '<rect x="0" y="0" width="144" height="96" rx="10" ' + stroke(2.4, 0.6) + '/>'
    +   grid
    +   '<rect x="36" y="24" width="36" height="24" rx="4" fill="none" ' + stroke(1.4, 0.3) + '/>'
    + '</g>'
    // ask bar at the foot
    + '<g>'
    +   '<rect x="380" y="322" width="440" height="44" rx="22" ' + stroke(2.4, 0.62) + '/>'
    +   '<line x1="414" y1="336" x2="414" y2="352" ' + stroke(2.4, 0.55) + '/>'
    +   '<line x1="432" y1="344" x2="520" y2="344" ' + stroke(2.0, 0.28) + '/>'
    +   '<circle cx="786" cy="344" r="12" ' + stroke(2.0, 0.45) + '/>'
    +   '<path d="M786 349v-10M781 343l5-5 5 5" ' + stroke(2.0, 0.5) + '/>'
    + '</g>'
    + '</g></svg>';
}

export { W as BANNER_W, H as BANNER_H };
