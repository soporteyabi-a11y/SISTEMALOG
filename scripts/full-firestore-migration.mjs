import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const projectId = config.projectId;
const apiKey = config.apiKey;
const targetDb = config.firestoreDatabaseId;
const encTargetDb = encodeURIComponent(targetDb);

async function listDocs(col, db) {
  const enc = db === '(default)' ? '(default)' : encodeURIComponent(db);
  const all = [];
  let pageToken = '';
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${enc}/documents/${col}?key=${apiKey}&pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed listing ${col} in ${db}: HTTP ${res.status}`);
    }
    const json = await res.json();
    if (json.documents) all.push(...json.documents);
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return all;
}

async function getDoc(col, docId, db) {
  const enc = db === '(default)' ? '(default)' : encodeURIComponent(db);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${enc}/documents/${col}/${encodeURIComponent(docId)}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

async function commitBatch(writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encTargetDb}/documents:commit?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Batch commit failed HTTP ${res.status}: ${txt}`);
  }
  return await res.json();
}

async function patchDoc(col, docId, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encTargetDb}/documents/${col}/${encodeURIComponent(docId)}?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Patch failed ${col}/${docId} HTTP ${res.status}: ${txt}`);
  }
  return await res.json();
}

async function migrateCoreCollections() {
  const coreCols = ['app_state', 'pedidos_empleados_state', 'citas_state', 'liq_state', 'horas_extras_state'];
  let migrated = 0;
  let skippedInSync = 0;

  for (const col of coreCols) {
    const docs = await listDocs(col, '(default)');
    console.log(`\n[Core] Revisando colección '${col}' (${docs.length} documentos)...`);
    for (const srcDoc of docs) {
      const docId = srcDoc.name.split('/').pop();
      const dstDoc = await getDoc(col, docId, targetDb);
      const srcUpdatedAt = srcDoc.fields?.updatedAt?.stringValue || srcDoc.updateTime;
      const dstUpdatedAt = dstDoc?.fields?.updatedAt?.stringValue || dstDoc?.updateTime;

      const needsUpdate = !dstDoc || JSON.stringify(srcDoc.fields) !== JSON.stringify(dstDoc.fields);
      if (!needsUpdate) {
        console.log(`  = ${col}/${docId}: Ya está 100% idéntico (${srcUpdatedAt})`);
        skippedInSync++;
        continue;
      }

      // Safety check: don't overwrite if destination has strictly newer updatedAt
      if (dstDoc && dstUpdatedAt && srcUpdatedAt && dstUpdatedAt > srcUpdatedAt) {
        console.log(`  ! ${col}/${docId}: Destino es más reciente (${dstUpdatedAt} > ${srcUpdatedAt}), omitiendo sobrescritura.`);
        continue;
      }

      await patchDoc(col, docId, srcDoc.fields);
      migrated++;
      console.log(`  + ${col}/${docId}: Migrado (${dstDoc ? dstUpdatedAt : 'NUEVO'} -> ${srcUpdatedAt})`);
    }
  }
  return { migrated, skippedInSync };
}

async function migrateLargeCollection(col) {
  const docs = await listDocs(col, '(default)');
  console.log(`\n[Full Sync] Colección '${col}': ${docs.length} documentos encontrados en (default).`);
  const BATCH_SIZE = 200;
  let written = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const writes = chunk.map(d => {
      const docId = d.name.split('/').pop();
      return {
        update: {
          name: `projects/${projectId}/databases/${targetDb}/documents/${col}/${docId}`,
          fields: d.fields || {}
        }
      };
    });
    await commitBatch(writes);
    written += chunk.length;
    if (written % 1000 === 0 || written === docs.length) {
      console.log(`  -> ${col}: ${written}/${docs.length} documentos migrados...`);
    }
  }
  return written;
}

async function run() {
  console.log(`================================================================`);
  console.log(`MIGRACIÓN INTEGRAL DE FIRESTORE -> ${targetDb}`);
  console.log(`================================================================`);

  const coreStats = await migrateCoreCollections();
  const provCount = await migrateLargeCollection('provisiones_state');
  const analyticsCount = await migrateLargeCollection('analisis_sync_logs');
  const queueCount = await migrateLargeCollection('sync_queue');
  const logsCount = await migrateLargeCollection('sync_logs');

  console.log(`\n================================================================`);
  console.log(`RESUMEN FINAL DE MIGRACIÓN:`);
  console.log(`- Colecciones core actualizadas/nuevas: ${coreStats.migrated} (ya en paridad: ${coreStats.skippedInSync})`);
  console.log(`- provisiones_state: ${provCount} documentos migrados`);
  console.log(`- analisis_sync_logs: ${analyticsCount} documentos migrados`);
  console.log(`- sync_queue: ${queueCount} documentos migrados`);
  console.log(`- sync_logs: ${logsCount} documentos migrados`);
  console.log(`================================================================`);
}

run().catch(err => {
  console.error('Error fatal en migración:', err);
  process.exit(1);
});
