import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const projectId = config.projectId;
const apiKey = config.apiKey;
const assignedDbId = config.firestoreDatabaseId;

function parseFirestoreRestField(field) {
  if (!field || typeof field !== 'object') return null;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return parseInt(field.integerValue, 10);
  if ('doubleValue' in field) return parseFloat(field.doubleValue);
  if ('booleanValue' in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('nullValue' in field) return null;
  if ('arrayValue' in field) {
    return (field.arrayValue.values || []).map(parseFirestoreRestField);
  }
  if ('mapValue' in field) {
    const res = {};
    const f = field.mapValue.fields || {};
    for (const k of Object.keys(f)) {
      res[k] = parseFirestoreRestField(f[k]);
    }
    return res;
  }
  return null;
}

function parseDoc(doc) {
  const nameParts = doc.name.split('/');
  const docId = nameParts[nameParts.length - 1];
  const fields = {};
  if (doc.fields) {
    for (const k of Object.keys(doc.fields)) {
      fields[k] = parseFirestoreRestField(doc.fields[k]);
    }
  }
  return {
    id: docId,
    createTime: doc.createTime,
    updateTime: doc.updateTime,
    fields
  };
}

async function listRootCollections(targetDb) {
  const encodedDb = targetDb === '(default)' ? '(default)' : encodeURIComponent(targetDb);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodedDb}/documents:listCollectionIds?key=${apiKey}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageSize: 100 })
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.collectionIds || [];
  } catch (e) {
    return [];
  }
}

async function getCollectionDocs(collectionName, targetDb) {
  const encodedDb = targetDb === '(default)' ? '(default)' : encodeURIComponent(targetDb);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodedDb}/documents/${collectionName}?key=${apiKey}&pageSize=100`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.documents || []).map(parseDoc);
  } catch (e) {
    return [];
  }
}

async function inspectDb(targetDb) {
  console.log(`\n========================================================================`);
  console.log(`ANALIZANDO BASE DE DATOS: "${targetDb}" EN PROYECTO "${projectId}"`);
  console.log(`========================================================================`);
  
  const rootCols = await listRootCollections(targetDb);
  console.log(`Colecciones raíz encontradas (${rootCols.length}):`, rootCols);

  const checkList = Array.from(new Set([
    ...rootCols,
    'app_state',
    'pedidos_empleados_state',
    'citas_state',
    'liq_state',
    'provisiones_state',
    'horas_extras_state',
    'fletes_solicitudes',
    'clientes',
    'transportadoras',
    'sync_queue',
    'sync_logs',
    'analisis_sync_logs'
  ]));

  for (const col of checkList) {
    const docs = await getCollectionDocs(col, targetDb);
    if (docs.length === 0) continue;

    console.log(`\n>>> Colección [${col}] (${docs.length} documentos):`);
    for (const d of docs) {
      const data = d.fields.data !== undefined ? d.fields.data : d.fields;
      const count = Array.isArray(data) ? `${data.length} elementos` : (data && typeof data === 'object' ? `${Object.keys(data).length} campos` : 'valor simple');
      console.log(`  - Doc ID: "${d.id}" | Tamaño: ${count} | Modificado: ${d.fields.updatedAt || d.updateTime} | Por: ${d.fields.updatedBy || 'N/A'}`);

      // Detailed info on key documents
      if (d.id === 'orders' && Array.isArray(data)) {
        console.log(`    * DETALLE DE ÓRDENES (${data.length} órdenes en memoria de Firestore):`);
        const estados = {};
        let conFactura = 0;
        let conFlete = 0;
        let fleteTotal = 0;
        let facturadoTotal = 0;
        let empleadosOrders = 0;
        let consolidadosOrders = 0;
        let fechas = [];

        data.forEach(o => {
          estados[o.estado || 'Sin Estado'] = (estados[o.estado || 'Sin Estado'] || 0) + 1;
          if (o.factura && String(o.factura).trim()) conFactura++;
          if (Number(o.flete) > 0) {
            conFlete++;
            fleteTotal += Number(o.flete);
          }
          if (Number(o.facturado) > 0) facturadoTotal += Number(o.facturado);
          else if (Number(o.venta) > 0) facturadoTotal += Number(o.venta);
          if (o.isEmpleado || (o.cliente && String(o.cliente).includes('EMPLEADO'))) empleadosOrders++;
          if (o.manifiestoCodigo || o.esConsolidado || o.consolidadoId) consolidadosOrders++;
          if (o.fechaIngreso) fechas.push(o.fechaIngreso);
        });
        fechas.sort();
        console.log(`      - Estados:`, JSON.stringify(estados));
        console.log(`      - Con Factura: ${conFactura} / ${data.length}`);
        console.log(`      - Con Flete: ${conFlete} / ${data.length} (Total Flete: $${fleteTotal.toLocaleString('es-CO')})`);
        console.log(`      - Facturado/Venta Total: $${facturadoTotal.toLocaleString('es-CO')}`);
        console.log(`      - Pedidos de Empleados: ${empleadosOrders}`);
        console.log(`      - Con Manifiesto / Consolidado: ${consolidadosOrders}`);
        console.log(`      - Fecha más antigua: ${fechas[0] || 'N/A'} | Fecha más reciente: ${fechas[fechas.length - 1] || 'N/A'}`);
        console.log(`      - Últimas 3 órdenes:`);
        data.slice(-3).forEach(o => {
          console.log(`        · [${o.id || o.pv}] ${o.cliente} | Fact: ${o.factura || '-'} | Est: ${o.estado} | Flete: $${Number(o.flete || 0).toLocaleString('es-CO')} | Transp: ${o.transportadora || '-'}`);
        });
      }

      if (d.id === 'carriers' && Array.isArray(data)) {
        console.log(`    * Transportadoras (${data.length}):`, data.slice(0, 5).map(c => c.nombre).join(', '), data.length > 5 ? '...' : '');
      }
      if (d.id === 'customers' && Array.isArray(data)) {
        console.log(`    * Clientes (${data.length}):`, data.slice(0, 5).map(c => c.nombre).join(', '), data.length > 5 ? '...' : '');
      }
      if (d.id === 'saved_vouchers' && Array.isArray(data)) {
        console.log(`    * Comprobantes de Provisión (${data.length})`);
      }
      if (col === 'pedidos_empleados_state' && d.id === 'orders' && Array.isArray(data)) {
        console.log(`    * Pedidos de Empleados en portal (${data.length})`);
      }
    }
  }
}

async function main() {
  await inspectDb(assignedDbId);
  if (assignedDbId !== '(default)') {
    await inspectDb('(default)');
  }
}

main();
