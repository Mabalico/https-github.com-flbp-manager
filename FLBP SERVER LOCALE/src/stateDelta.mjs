const UNSAFE_PATH_PARTS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const sameValue = (left, right) => Object.is(left, right);

const assertSafePath = (path) => {
  if (!Array.isArray(path) || path.some((part) => UNSAFE_PATH_PARTS.has(String(part)))) {
    throw new Error('Patch stato non valida: percorso non sicuro.');
  }
};

const walk = (before, after, path, operations) => {
  assertSafePath(path);
  if (sameValue(before, after)) return;

  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    for (let index = 0; index < after.length; index += 1) {
      walk(before[index], after[index], [...path, index], operations);
    }
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    for (const key of Object.keys(before)) {
      assertSafePath([...path, key]);
      if (!Object.hasOwn(after, key)) operations.push({ op: 'delete', path: [...path, key] });
    }
    for (const key of Object.keys(after)) {
      assertSafePath([...path, key]);
      if (!Object.hasOwn(before, key)) operations.push({ op: 'set', path: [...path, key], value: structuredClone(after[key]) });
      else walk(before[key], after[key], [...path, key], operations);
    }
    return;
  }

  operations.push({ op: 'set', path, value: structuredClone(after) });
};

export const buildStatePatch = (before, after) => {
  const operations = [];
  walk(before, after, [], operations);
  return operations;
};

export const applyStatePatch = (base, operations) => {
  let output = structuredClone(base);
  for (const operation of operations || []) {
    const path = operation?.path;
    assertSafePath(path);
    if (!['set', 'delete'].includes(operation?.op)) throw new Error('Patch stato non valida: operazione sconosciuta.');
    if (path.length === 0) {
      if (operation.op === 'delete') output = undefined;
      else output = structuredClone(operation.value);
      continue;
    }

    let parent = output;
    for (let index = 0; index < path.length - 1; index += 1) {
      const part = path[index];
      if (parent == null || typeof parent !== 'object' || !Object.hasOwn(parent, part)) {
        throw new Error('Patch stato non applicabile: percorso mancante.');
      }
      parent = parent[part];
    }
    const last = path[path.length - 1];
    if (parent == null || typeof parent !== 'object') throw new Error('Patch stato non applicabile: destinazione mancante.');
    if (operation.op === 'delete') {
      if (Array.isArray(parent)) throw new Error('Patch stato non valida: eliminazione da array non consentita.');
      delete parent[last];
    } else {
      parent[last] = structuredClone(operation.value);
    }
  }
  return output;
};
