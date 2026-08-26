/* @amazing-fish/dsh-plugin-skill-fuzzy-match — client half (ESM)
 *
 * Patch the built-in '/' skill source (dsh-client-ui-skill) so the slash menu
 * matches skills by ordered-subsequence fuzzy match instead of strict
 * `name.startsWith(query)`. Typing /xx now also surfaces skills whose name
 * merely contains xx (e.g. aa-xx-bb), not only those starting with xx.
 *
 * Monkey-patches the already-registered "/skill" source in place (re-registering
 * the same (trigger, name) would throw), reuses the original catalog fetch
 * (empty query returns all skills), then filters/ranks locally with the same
 * fuzzyScore algorithm used by the sibling command source
 * (dsh-client-ui-commands). On stop/update the original candidates is restored.
 *
 * Lifecycle note: ctx.effect(callback) runs callback NOW and registers its
 * RETURN VALUE as the disposer — so the callback must return the cleanup fn,
 * not be the cleanup fn.
 */

function boundaryBonus(name, index) {
  return index === 0 || name.charAt(index - 1) === '-' || name.charAt(index - 1) === '_' ? 8 : 0;
}

function fuzzyScore(name, query) {
  if (query === '') return 0;
  if (query.length > name.length) return undefined;
  var noMatch = Number.NEGATIVE_INFINITY;
  var previous = new Array(name.length).fill(noMatch);
  for (var i = 0; i < name.length; i++) {
    if (name.charAt(i) === query.charAt(0)) previous[i] = 1 + boundaryBonus(name, i) - i;
  }
  for (var qi = 1; qi < query.length; qi++) {
    var current = new Array(name.length).fill(noMatch);
    var bestGapped = noMatch;
    for (var i = 0; i < name.length; i++) {
      var gappedIndex = i - 2;
      if (gappedIndex >= 0) {
        var prior = previous[gappedIndex] ?? noMatch;
        if (prior !== noMatch) bestGapped = Math.max(bestGapped, prior + gappedIndex);
      }
      if (name.charAt(i) !== query.charAt(qi)) continue;
      var bonus = 1 + boundaryBonus(name, i);
      var adjacent = i > 0 ? (previous[i - 1] ?? noMatch) : noMatch;
      if (adjacent !== noMatch) current[i] = adjacent + bonus + 4;
      if (bestGapped !== noMatch) current[i] = Math.max(current[i] ?? noMatch, bestGapped + bonus + 1 - i);
    }
    previous = current;
  }
  var best = noMatch;
  for (var _i = 0; _i < previous.length; _i++) best = Math.max(best, previous[_i]);
  return best === noMatch ? undefined : best;
}

function patchSource(src) {
  if (src.__skillFuzzyPatched) {
    console.log('[skill-fuzzy] already patched, skipping');
    return null;
  }
  var original = src.candidates;
  if (typeof original !== 'function') {
    console.error('[skill-fuzzy] skill source.candidates is not a function');
    return null;
  }
  src.candidates = async function (session, req) {
    var all = await original.call(src, session, {
      query: '',
      quoted: req.quoted === undefined ? false : req.quoted,
      position: req.position,
      signal: req.signal
    });
    if (req.signal && req.signal.aborted) return [];
    var q = (req.query === undefined ? '' : req.query).toLowerCase();
    if (q === '') return all;
    var ranked = [];
    all.forEach(function (item, index) {
      var name = String(item.name).toLowerCase();
      var score = fuzzyScore(name, q);
      if (score !== undefined) ranked.push({ item: item, index: index, prefix: name.startsWith(q), score: score });
    });
    ranked.sort(function (l, r) {
      return Number(r.prefix) - Number(l.prefix) || r.score - l.score || l.index - r.index;
    });
    return ranked.map(function (m) { return m.item; });
  };
  src.__skillFuzzyPatched = true;
  src.__skillFuzzyOriginal = original;
  try { window.__skillFuzzyPatched = true; } catch (e) {}
  console.log('[skill-fuzzy] PATCHED skill source candidates (startsWith -> fuzzy subsequence)');
  return function restore() {
    src.candidates = original;
    delete src.__skillFuzzyPatched;
    delete src.__skillFuzzyOriginal;
    try { delete window.__skillFuzzyPatched; } catch (e) {}
    console.log('[skill-fuzzy] restored original skill source candidates');
  };
}

export default {
  inject: ['inputTriggers', 'timer'],
  apply(ctx) {
    var triggers = ctx.inputTriggers;
    var sources = triggers.live && triggers.live.sources;
    if (!Array.isArray(sources)) {
      console.error('[skill-fuzzy] inputTriggers.live.sources not accessible even after inject');
      return;
    }
    var restoreFn = null;
    var attempt = function () {
      var src = sources.find(function (s) { return s.trigger === '/' && s.name === 'skill'; });
      if (src === undefined) {
        console.log('[skill-fuzzy] skill source not registered yet, will retry in 500ms');
        return false;
      }
      restoreFn = patchSource(src);
      return restoreFn !== null;
    };
    if (attempt()) {
      ctx.effect(function () { return function () { restoreFn(); }; }, 'skill-fuzzy: restore candidates');
      return;
    }
    var tries = 0;
    var stop = ctx.interval(function () {
      tries++;
      if (attempt()) {
        stop.dispose();
        ctx.effect(function () { return function () { restoreFn(); }; }, 'skill-fuzzy: restore candidates (late)');
        return;
      }
      if (tries >= 20) {
        console.error('[skill-fuzzy] gave up after 20 retries (~10s): skill source never registered');
        stop.dispose();
      }
    }, 500);
    ctx.effect(function () { return function () { stop.dispose(); }; }, 'skill-fuzzy: stop retry interval');
  }
};
