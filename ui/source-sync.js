// A failed source write poisons its entire precomputed queue. Reconciliation
// starts a new generation; numeric counters alone never establish ancestry.
(function () {
  'use strict';
  function create(call) {
    let chain = Promise.resolve(), blocked = false, generation = 0;
    return {
      enqueue(args) {
        const ownGeneration = generation;
        const next = chain.then(() => {
          if (blocked || ownGeneration !== generation) throw new Error('Source writes are paused until the shared document is reconciled.');
          return call(args);
        }).catch(error => {
          if (ownGeneration === generation) blocked = true;
          throw error;
        });
        chain = next; chain.catch(() => {});
        return next;
      },
      pause() { blocked = true; },
      reset() { generation++; blocked = false; chain = Promise.resolve(); },
      get blocked() { return blocked; },
    };
  }
  function canReplay(saved, current) {
    return !!saved && typeof saved.baseText === 'string' && saved.baseText === current.text;
  }
  globalThis.SvgSourceSync = { create, canReplay };
})();
