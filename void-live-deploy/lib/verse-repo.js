// Verse's public home repository. Live readers of that repo (the brain's health watch, unbidden source links, status,
// team pull-request titles) import this instead of spelling the slug themselves.
export const REPO = 'Adammbeam/Verse-A-to-Mind';
export const REPO_URL = 'https://github.com/' + REPO;
export const REPO_API = 'https://api.github.com/repos/' + REPO;

const OWN = /^https:\/\/github\.com\/Adammbeam\/Verse-A-to-Mind(?:\/|$)/;
// files and commits moved with the tree; pull, issue and Actions numbers did not
const MOVED = /^https:\/\/github\.com\/atomeam\/void-loop\/(blob|tree|commit|raw)(\/.*)$/;

/** a URL on Verse's own public repo, or '' if it is not. A file or commit link on the old home is rewritten; a pull, issue or Actions link is not. */
export function ownRepoUrl(u) {
  const s = String(u || '');
  if (OWN.test(s)) return s;
  const m = s.match(MOVED);
  return m ? REPO_URL + '/' + m[1] + m[2] : '';
}
