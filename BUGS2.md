## 🔴 “Critical” 1: proximityMap not updated after posting

**This is a valid bug, but it’s not a “race condition.”** It’s a **state update omission** that can cause duplicates within the same run.

**Why it matters**

- Your dedupe decision uses **both** `existingFingerprintSet` and `proximityMap` (or equivalent).
- After you post a grouped inline comment, you update the fingerprint set but not the proximity structure, so later groups in the same run can miss “already posted nearby” detection.

**Do this**

- After posting, update **both** structures for each finding in the posted group:
  - `existingFingerprintSet.add(key)`
  - `proximityMap.add(finding.file, finding.line, key)` (or whatever your proximity index expects)

- Add a regression test: “two groups posted in same run; second group within threshold should not post duplicate.”

**Net**: Fix now. High value, low risk.

---

## 🔴 “Critical” 2: staleCount calculation “off-by-one”

This is **not actually off-by-one** based on the described invariants, but it **is confusing** and easy to mis-maintain.

**Reality**

- If `shouldResolve === true`, `partiallyResolved` should be empty, so the formula evaluates to `allMarkersInComment.length`, which is correct.
- If `shouldResolve === false`, you get `partiallyResolved.length`, which is also correct.

**Do this**

- Replace the expression with an explicit, unambiguous value:
  - `const staleCount = shouldResolve ? totalMarkers : partiallyResolved.length;`

- Keep parity with ADO.

**Net**: Not a logic bug, but worth simplifying to prevent future bugs.

---

## 🟡 Medium 3: cache entry mutation

This is **style/safety**, not a likely runtime bug. But it’s a clean improvement.

**Do this**

- Use immutable update when writing to memory cache:
  - `memoryCache.set(key, { ...entry, result: validated });`

**Net**: Good hygiene; low risk.

---

## 🟡 Medium 4: empty-string marker push in resolution.ts

This is mostly a **non-issue** because you guard with `if (marker && resolvedSet.has(marker))`, but the reviewer is right that pushing `''` is pointless and could confuse indexing logic later.

**Do this**

- Don’t push empty markers:
  - `if (match[1]) markers.push(match[1]);`

- Add a test for malformed marker extraction producing no markers and ensuring behavior stays “unresolved + warning”.

**Net**: Small cleanup; reduces footguns.

---

## 🟡 Medium 6: deleted files set uses raw paths (normalization mismatch)

This is a **real correctness bug** candidate if your system normalizes finding paths but not deleted paths.

**Do this**

- Build `deletedFiles` from canonicalized paths (same normalization function used elsewhere).
- Add a regression test with `./src/x.ts` vs `src/x.ts`.

**Net**: Fix now if you rely on deleted-file filtering.

---

## 🟡 Medium 7: leading slash in ADO thread context

This is only a bug if you use the same path string for both:

- dedupe/identity, **and**
- ADO API context

If those are separated (identity uses normalized, API uses ADO-required format), it’s fine.

**Do this**

- Make it explicit in code:
  - `const normalizedPath = normalizeRepoPath(finding.file);`
  - `const adoPath = normalizedPath.startsWith('/') ? normalizedPath : '/' + normalizedPath;`

- Ensure all dedupe keys use `normalizedPath` only.

**Net**: Clarify + enforce; likely not urgent but prevents mismatches.

---

## 🔵 Low items

8, 9, 10, 11 are mostly **style/perf**. I would **not** take them in a bugfix PR unless you’re already touching that code.

- **O(n) searches**: acceptable; only optimize if you have evidence.
- **droppedCount**: either remove or clearly mark as reserved, but low priority.
- **markerPattern ReDoS**: low risk given bounded comment bodies; acceptable.
