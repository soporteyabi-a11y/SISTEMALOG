import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const projectId = config.projectId;
const apiKey = config.apiKey;
const assignedDbId = config.firestoreDatabaseId;

const targetDocs = [
  { col: 'app_state', doc: 'orders' },
  { col: 'app_state', doc: 'carriers' },
  { col: 'app_state', doc: 'customers' },
  { col: 'app_state', doc: 'novedades' },
  { col: 'app_state', doc: 'deleted_orders' },
  { col: 'app_state', doc: 'reminders' },
  { col: 'app_state', doc: 'cierres' },
  { col: 'pedidos_empleados_state', doc: 'orders' },
  { col: 'pedidos_empleados_state', doc: 'products' },
  { col: 'pedidos_empleados_state', doc: 'config' },
  { col: 'provisiones_state', doc: 'saved_vouchers' },
  { col: 'citas_state', doc: 'appointments' },
  { col: 'citas_state', doc: 'archived' },
  { col: 'citas_state', doc: 'clients' },
  { col: 'liq_state', doc: 'catalog' },
  { col: 'liq_state', doc: 'clientes' }
];

async function syncDoc(col, docId) {
  // Read from (default)
  const sourceUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${col}/${docId}?key=${apiKey}`;
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    console.log(`[Sync] Skip ${col}/${docId}: not found in (default) (status ${res.status})`);
    return;
  }
  const sourceJson = await res.json();
  if (!sourceJson.fields) {
    console.log(`[Sync] Skip ${col}/${docId}: empty fields`);
    return;
  }

  // Write to assignedDbId
  const encTarget = encodeURIComponent(assignedDbId);
  const targetUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encTarget}/documents/${col}/${docId}?key=${apiKey}`;
  const putRes = await fetch(targetUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: sourceJson.fields })
  });

  if (putRes.ok) {
    console.log(`[Sync OK] ${col}/${docId} copiado exitosamente a ${assignedDbId}`);
  } else {
    const errText = await putRes.text();
    console.log(`[Sync ERROR] ${col}/${docId} falló:`, errText);
  }
}

async function run() {
  console.log(`Iniciando sincronización de paridad total hacia ${assignedDbId}...`);
  for (const item of targetDocs) {
    await syncDoc(item.col, item.doc);
  }
  console.log(`Sincronización de paridad completada.`);
}

run();
