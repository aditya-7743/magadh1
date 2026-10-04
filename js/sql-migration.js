// Complete point-in-time export for SQL migration; excludes login sessions/tokens.
window.LMS = window.LMS || {};
LMS.exportSqlMigrationSnapshot = async () => {
  if (LMS.DB.switching) throw Error('Wait for the account change to finish.');
  const scope = LMS.DB.scope;
  await LMS.DB.flush();
  if (scope !== LMS.DB.scope || LMS.DB.switching) throw Error('Account changed. Please export again.');
  const keys = ['students','payments','halls','shifts','settings','attendance','activityLog','pendingWork','expenses','owner','_inactiveFirstSeen','_paymentDeletions','offline_queue'];
  const snapshot = LMS.DB.sqlMode ? await LMS.DB.completeSqlBackup() : {};
  for (const key of LMS.DB.sqlMode ? [] : keys) {
    const value = LMS.DB.localLoad(key,undefined);
    if (value !== undefined && value !== null) snapshot[key] = JSON.parse(JSON.stringify(value));
  }
  const exportedAt = new Date().toISOString();
  snapshot.exportDate = exportedAt;
  snapshot.version = 'sql-migration-1';
  snapshot.migrationMetadata = {
    source: 'current-app', scope, firebaseUid: LMS.DB.userId || null,
    sourceProject: FIREBASE_CONFIG.projectId,
    pendingCloudOperations: (snapshot.offline_queue || []).length,
    inactiveStudents: (snapshot.students || []).filter(student=>student.isActive===false).length,
    attendanceIncluded: Object.hasOwn(snapshot,'attendance'),
    requiresFinalWriteFreeze: true
  };
  const bytes = JSON.stringify(snapshot,null,2);
  const blob = new Blob([bytes],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'library_SQL_migration_'+exportedAt.replace(/[:.]/g,'-')+'.json';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  return snapshot.migrationMetadata;
};
LMS.SqlMigrationPanel = () => {
  const {showToast,students} = useContext(LMS.AppContext);
  const [exporting,setExporting]=useState(false);
  const exportSnapshot=async()=>{
    setExporting(true);
    try {
      const result=await LMS.exportSqlMigrationSnapshot();
      showToast('Complete export downloaded. Includes '+result.inactiveStudents+' inactive students.','success');
    } catch(error) { showToast(error.message,'error'); }
    finally { setExporting(false); }
  };
  return html`<section class="card sql-migration-panel">
    <div class="section-heading"><div><h3>${LMS.DB.sqlMode ? 'SQL backup · Complete data export' : 'Move to SQL · Complete data export'}</h3><p>Include the latest attendance, deactivations, photos and payment history.</p></div><${LMS.Icons.Cloud} /></div>
    <p class="profile-help">${students.length} students · ${students.filter(student=>student.isActive===false).length} inactive. ${LMS.DB.sqlMode ? 'Connected to PostgreSQL. Exports include photos and complete history.' : 'SQL migration is being prepared; this app still uses its current storage.'}</p>
    <${LMS.Button} disabled=${exporting} onClick=${exportSnapshot}><${LMS.Icons.Download} />${exporting ? 'Preparing export…' : LMS.DB.sqlMode ? 'Download complete backup' : 'Export latest data for SQL'}</${LMS.Button}>
  </section>`;
};
