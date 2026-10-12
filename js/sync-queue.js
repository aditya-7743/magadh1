// Scheduling metadata stays in the durable outbox, outside the API payload.
window.LMS = window.LMS || {};
LMS.SyncQueue = {
  resources(change) {
    const { key, id, value } = change;
    const tokens = new Set([key + '/' + (id || ''), ...(change.dependencies || [])]);
    if (key === 'students') {
      tokens.add('student:' + id);
      if (value?.rollNo) tokens.add('roll:' + String(value.rollNo).trim().toLowerCase());
      if (value?.assignedSeat) tokens.add('seat:' + JSON.stringify(value.assignedSeat));
    }
    if (value?.studentId) tokens.add('student:' + value.studentId);
    if (key === 'attendance') tokens.add('student:' + String(id).slice(String(id).indexOf('/') + 1));
    if (key === 'halls' || key === 'shifts') tokens.add('seat:*');
    if (key === 'settings' || !['students','payments','attendance','halls','shifts','activityLog','expenses','pendingWork'].includes(key)) tokens.add('*');
    return tokens;
  },
  overlap(a, b) {
    return a.has('*') || b.has('*') || [...a].some(token => b.has(token) || token.startsWith('seat:') && b.has('seat:*')) || a.has('seat:*') && [...b].some(token => token.startsWith('seat:'));
  },
  plan(queue) {
    const blocked = [];
    return queue.map(operation => {
      const resources = new Set((operation.changes || []).flatMap(change => [...this.resources(change)]));
      const dependency = blocked.find(item => this.overlap(resources, item.resources));
      const waitingFor = dependency?.id || null;
      if (operation.syncIssue || waitingFor) blocked.push({ id: waitingFor || operation.id, resources });
      return { operation, waitingFor, ready: !operation.syncIssue && !waitingFor };
    });
  },
  isRecordError(error) {
    // A network/auth/server failure has an uncertain outcome: stop and replay the
    // same idempotency key later. Only definitive record rejections are isolated.
    if (['DATASET_CHANGED','OPERATION_ID_REUSED','ORIGIN_NOT_ALLOWED','READ_ONLY_PREVIEW','INVALID_SESSION','SIGN_IN_REQUIRED','ADMIN_ACCESS_REQUIRED'].includes(error.code)) return false;
    return [400,409,413,422].includes(error.status) && !!error.code || ['ACCOUNTS_SIGN_IN_REQUIRED','HALL_EMAIL_VERIFICATION_REQUIRED','CASH_USE_LEDGER'].includes(error.code);
  },
  withLock(scope, work) {
    return navigator.locks?.request ? navigator.locks.request('lms-sync:' + scope, work) : work();
  }
};
