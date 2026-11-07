import { Order, Carrier, Customer } from '../types';

export function printSingleOrder(order: Order, carriers: Carrier[], customers: Customer[]) {
  // Find customer by name and address/city to get correct branch
  let customer = null;
  if (order.direccion) {
    customer = customers.find(c => 
      c.nombre.trim().toUpperCase() === order.cliente.trim().toUpperCase() &&
      c.dir.trim().toUpperCase() === order.direccion.trim().toUpperCase()
    );
  }
  if (!customer) {
    customer = customers.find(c => c.nombre.trim().toUpperCase() === order.cliente.trim().toUpperCase());
  }
  const customerDir = order.direccion || customer?.dir || order.ciudad || '---';

  // Find carrier by name
  const carrier = carriers.find(c => c.nombre.trim().toUpperCase() === (order.transportadora || '').trim().toUpperCase());
  const carrierNit = carrier?.nit || '---';
  const carrierDir = carrier?.dir || '---';
  const carrierTel = carrier?.tel || '---';
  const carrierCiudad = carrier?.ciudad || '---';

  // Format monetary value
  const formatCurrency = (val: number) => {
    return '$ ' + val.toLocaleString('es-CO');
  };

  const formatWeight = (val: number) => {
    return val.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  };

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const todayStr = new Date().toLocaleDateString('es-CO');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Solicitud de Vehículo - ${order.id}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    body {
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 20px;
      color: #1e293b;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      border: 1.5px solid #000000;
      padding: 0;
    }
    
    /* Table Layout Structure matching the design exactly */
    table.main-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0;
    }
    
    table.main-table td {
      border: 1px solid #000000;
      padding: 0;
      vertical-align: top;
    }
    
    /* Top Header Row */
    .header-logo-cell {
      width: 28%;
      text-align: center;
      padding: 12px !important;
    }
    
    .logo-large {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 2px;
      margin: 0;
      color: #000000;
      line-height: 1;
    }
    
    .logo-sub {
      font-size: 11px;
      font-weight: 700;
      margin: 2px 0 0 0;
      letter-spacing: 1px;
      color: #334155;
    }
    
    .logo-desc {
      font-size: 7.5px;
      color: #64748b;
      margin: 4px 0 0 0;
      font-style: italic;
    }
    
    .header-title-cell {
      width: 44%;
      text-align: center;
      vertical-align: middle !important;
      padding: 15px !important;
    }
    
    .header-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 1.5px;
      margin: 0;
      text-transform: uppercase;
    }
    
    .header-meta-cell {
      width: 28%;
      font-size: 10px;
    }
    
    .meta-box {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    
    .meta-row-top {
      border-bottom: 1px solid #000000;
      padding: 8px 10px;
      font-weight: 600;
      height: 50%;
    }
    
    .meta-row-bottom {
      padding: 8px 10px;
      color: #334155;
      height: 50%;
    }
    
    /* Section blocks */
    .company-info-cell {
      width: 50%;
      padding: 12px !important;
      font-size: 11px;
      line-height: 1.45;
    }
    
    .company-name {
      font-size: 13px;
      font-weight: 800;
      margin: 0 0 6px 0;
      letter-spacing: 0.5px;
    }
    
    .solicitud-details-cell {
      width: 50%;
      padding: 0 !important;
    }
    
    .solicitud-header {
      background-color: #ffffff;
      color: #0284c7;
      text-align: right;
      font-weight: 800;
      font-size: 11px;
      padding: 6px 10px;
      border-bottom: 1px solid #000000;
      letter-spacing: 0.5px;
    }
    
    /* Details internal table */
    .details-subtable {
      width: 100%;
      border-collapse: collapse;
    }
    
    .details-subtable td {
      border: none !important;
      border-bottom: 1px solid #000000 !important;
      padding: 5px 8px !important;
      font-size: 9.5px;
    }
    
    .details-subtable tr:last-child td {
      border-bottom: none !important;
    }
    
    .label-col {
      width: 38%;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 8.5px;
      color: #000000;
    }
    
    .val-col {
      width: 62%;
      font-weight: 500;
    }
    
    /* Carrier block */
    .carrier-cell {
      width: 55%;
      padding: 12px !important;
      font-size: 10.5px;
      line-height: 1.5;
    }
    
    .cost-cell {
      width: 45%;
      text-align: center;
      vertical-align: middle !important;
      padding: 15px !important;
    }
    
    .cost-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      margin: 0 0 4px 0;
    }
    
    .cost-value {
      font-size: 24px;
      font-weight: 800;
      color: #000000;
      margin: 0;
    }
    
    /* Disclaimer */
    .disclaimer-cell {
      padding: 8px 12px !important;
      font-size: 8.5px;
      line-height: 1.35;
      text-align: justify;
      color: #000000;
    }
    
    /* Grid/Table of merchandise */
    .merch-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0;
    }
    
    .merch-table th {
      border: 1px solid #000000;
      padding: 6px 8px;
      font-size: 9px;
      font-weight: 800;
      text-align: center;
      text-transform: uppercase;
      background-color: #ffffff;
    }
    
    .merch-table td {
      border: 1px solid #000000;
      padding: 6px 8px;
      font-size: 10px;
    }
    
    .text-center {
      text-align: center !important;
    }
    
    .text-right {
      text-align: right !important;
    }
    
    .merch-totals-row {
      font-weight: 800;
    }
    
    /* Footer details */
    .type-vehicle-cell {
      padding: 10px 12px !important;
      font-size: 10px;
    }
    
    .obs-cell {
      padding: 10px 12px !important;
      font-size: 10px;
      line-height: 1.4;
    }
    
    .signature-area {
      margin-top: 50px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 0 10px;
    }
    
    .signature-box {
      width: 45%;
      border-top: 1.5px solid #000000;
      text-align: center;
      padding-top: 8px;
    }
    
    .signature-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      margin: 0;
    }
    
    .signature-sub {
      font-size: 10px;
      color: #334155;
      margin: 2px 0 0 0;
    }
    
    .print-date {
      font-size: 10px;
      color: #475569;
    }
    
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  
  <div class="no-print" style="max-width: 800px; margin: 0 auto 15px auto; display: flex; justify-content: flex-end;">
    <button onclick="window.print()" style="background-color: #0284c7; color: white; border: none; padding: 10px 20px; font-size: 13px; font-weight: bold; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
      🖨️ Imprimir Solicitud
    </button>
  </div>

  <div class="container">
    <table class="main-table">
      <!-- Row 1: Header logo, title, metadata -->
      <tr>
        <td class="header-logo-cell">
          <div class="logo-large">SISTEMALOG</div>
          <div class="logo-sub">LOGÍSTICA</div>
          <div class="logo-desc">control de operaciones logísticas</div>
        </td>
        <td class="header-title-cell">
          <h1 class="header-title">Solicitud Vehículo</h1>
        </td>
        <td class="header-meta-cell" style="padding: 0 !important;">
          <div class="meta-box">
            <div class="meta-row-top">Código:</div>
            <div class="meta-row-bottom">Versión: 2.0 | Año: 2023</div>
          </div>
        </td>
      </tr>
      
      <!-- Row 2: Company details, Solicitud info -->
      <tr>
        <td class="company-info-cell" colspan="1">
          <div class="company-name">SISTEMALOG SAS</div>
          Nit. 800.225.074-3<br>
          Cra 39 No. 14 - 62 Acopi - Yumbo<br>
          PBX: (02) 384 40 90<br>
          Móvil: 3215879382<br>
          Correo: logistica@sistemalog.com.co
        </td>
        <td class="solicitud-details-cell" colspan="2">
          <div class="solicitud-header">SOLICITUD NO. SOL-${order.id}</div>
          <table class="details-subtable">
            <tr>
              <td class="label-col">Orden de Compra</td>
              <td class="val-col">${order.oc || '---'}</td>
            </tr>
            <tr>
              <td class="label-col">Fecha de Salida</td>
              <td class="val-col">${order.fechaSalida || '---'}</td>
            </tr>
            <tr>
              <td class="label-col">Ciudad / Origen</td>
              <td class="val-col">${order.origen || 'ACOPI-YUMBO'}</td>
            </tr>
            <tr>
              <td class="label-col">Dirección Entrega</td>
              <td class="val-col">${customerDir}</td>
            </tr>
            <tr>
              <td class="label-col">F. Estimada Entrega</td>
              <td class="val-col">${order.fechaEntrega || '---'}</td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Row 3: Carrier, Cost -->
      <tr>
        <td class="carrier-cell" colspan="1">
          <strong>Transportadora--</strong> ${order.transportadora || '---'}<br>
          <strong>NIT</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${carrierNit}<br>
          <strong>Dirección</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${carrierDir}<br>
          <strong>Teléfono</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${carrierTel}<br>
          <strong>Ciudad</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${carrierCiudad}
        </td>
        <td class="cost-cell" colspan="2">
          <div class="cost-title">Costo Masivo</div>
          <div class="cost-value">${formatCurrency(order.flete || 0)}</div>
        </td>
      </tr>
      
      <!-- Row 4: Disclaimer -->
      <tr>
        <td class="disclaimer-cell" colspan="3">
          En el cargue el personal debe Presentar: Copia de Cédula del Conductor, Afiliación al Sistema General de Riesgos Laborales. El Conductor y el personal de cargue debe presentarse con los siguientes elementos de protección para ingreso a la compañía como son la botas de Seguridad con punteras.
        </td>
      </tr>
      
      <!-- Row 5: Merchandise Table -->
      <tr>
        <td colspan="3" style="border: none !important; padding: 0 !important;">
          <table class="merch-table">
            <thead>
              <tr>
                <th style="width: 12%;">PV</th>
                <th style="width: 48%; text-align: left;">Datos de Mercancía</th>
                <th style="width: 16%;">Ciudad de Destino</th>
                <th style="width: 8%;">Cajas</th>
                <th style="width: 8%;">Peso</th>
                <th style="width: 10%;">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-center"><strong>${order.pv || '---'}</strong></td>
                <td>${order.cliente || '---'}</td>
                <td class="text-center">${order.ciudad || '---'}</td>
                <td class="text-center">${order.cajasFact || order.cajas || 0}</td>
                <td class="text-center">${formatWeight(order.pesoFact || order.peso || 0)}</td>
                <td class="text-right">${formatCurrency(order.facturado || order.venta || 0)}</td>
              </tr>
              <tr class="merch-totals-row">
                <td colspan="3" class="text-right" style="padding-right: 15px;">TOTALES</td>
                <td class="text-center">${order.cajasFact || order.cajas || 0}</td>
                <td class="text-center">${formatWeight(order.pesoFact || order.peso || 0)}</td>
                <td class="text-right">${formatCurrency(order.facturado || order.venta || 0)}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
      
      <!-- Row 6: Vehicle type -->
      <tr>
        <td class="type-vehicle-cell" colspan="3">
          <strong>TIPO DE VEHÍCULO:</strong> <u>Sencillo</u>${order.placa ? ` (Placa: ${order.placa}${order.conductor ? `, Conductor: ${order.conductor}` : ''})` : ''}
        </td>
      </tr>
      
      <!-- Row 7: Observations -->
      <tr>
        <td class="obs-cell" colspan="3">
          <strong>Observaciones:</strong><br>
          ${order.obs || '---'}
        </td>
      </tr>
    </table>
    
    <!-- Footer / Signature Area outside main table -->
    <div class="signature-area">
      <div class="signature-box">
        <h3 class="signature-title">COORDINADOR LOGISTICO</h3>
        <p class="signature-sub">Cel. 3176362128</p>
      </div>
      <div class="print-date">
        Fecha Impresión: ${todayStr}
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    }
  </script>
</body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

export interface ManifestPrintData {
  manifiestoId: string;
  tipo: 'CONSOLIDADO' | 'INDIVIDUAL';
  fechaSalida: string;
  transportadora: string;
  placa: string;
  conductor: string;
  celular?: string;
  fleteTotal: number;
  orders: Order[];
  porcentajeFijado?: number;
  observaciones?: string;
}

export function printManifestDocument(data: ManifestPrintData) {
  const {
    manifiestoId,
    tipo,
    fechaSalida,
    transportadora,
    placa,
    conductor,
    celular,
    fleteTotal,
    orders,
    porcentajeFijado,
    observaciones
  } = data;

  const totalFacturado = orders.reduce((sum, o) => sum + (Number(o.facturado || o.venta) || 0), 0);
  const totalCajas = orders.reduce((sum, o) => sum + (Number(o.cajasFact || o.cajas) || 0), 0);
  const totalPeso = orders.reduce((sum, o) => sum + (Number(o.pesoFact || o.peso) || 0), 0);
  const totalFleteCalculado = orders.reduce((sum, o) => sum + (Number(o.flete) || 0), 0);
  const fleteEfectivo = fleteTotal > 0 ? fleteTotal : totalFleteCalculado;
  const pctGlobal = totalFacturado > 0 ? (fleteEfectivo / totalFacturado) * 100 : 0;
  const todayStr = new Date().toLocaleDateString('es-CO');

  const rowsHtml = orders.map((o, idx) => {
    const vFact = Number(o.facturado || o.venta) || 0;
    const partPct = totalFacturado > 0 ? (vFact / totalFacturado) * 100 : 0;
    const oFlete = Number(o.flete) || 0;
    const fleteFactPct = vFact > 0 ? (oFlete / vFact) * 100 : 0;

    return `
      <tr>
        <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
        <td><strong>${o.id}</strong><br><span style="font-size: 8.5px; color: #475569;">PV: ${o.pv || 'S/N'}</span></td>
        <td style="font-weight: bold; color: #0f172a;">${o.factura || 'PENDIENTE'}</td>
        <td><strong>${o.cliente}</strong></td>
        <td>${o.ciudad || '---'}</td>
        <td style="text-align: center; font-weight: bold;">${o.cajasFact || o.cajas}</td>
        <td style="text-align: right;">${(Number(o.pesoFact || o.peso) || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: bold;">$ ${(Number(vFact) || 0).toLocaleString('es-CO')}</td>
        <td style="text-align: center; font-size: 9px; color: #334155;">${partPct.toFixed(2)}%</td>
        <td style="text-align: right; font-weight: bold;">$ ${(Number(oFlete) || 0).toLocaleString('es-CO')}</td>
        <td style="text-align: center; font-weight: bold; color: #047857;">${fleteFactPct.toFixed(2)}%</td>
      </tr>
    `;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Manifiesto de Carga - ${manifiestoId}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    body {
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 18px;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 10px;
    }
    .sheet {
      max-width: 900px;
      margin: 0 auto;
      border: 1.5px solid #0f172a;
      padding: 14px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
    }
    .logo-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 1.5px;
      margin: 0;
      color: #0f172a;
    }
    .logo-sub {
      font-size: 10px;
      font-weight: 700;
      color: #475569;
      margin: 2px 0 0 0;
    }
    .badge-modalidad {
      display: inline-block;
      padding: 3px 8px;
      background: #0f172a;
      color: #ffffff;
      font-weight: 800;
      font-size: 10px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .trip-card {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-collapse: collapse;
      margin-bottom: 14px;
      background: #f8fafc;
    }
    .trip-card td {
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      font-size: 10px;
    }
    .trip-card strong {
      color: #0f172a;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    table.data-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 6px 6px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid #0f172a;
    }
    table.data-table td {
      padding: 5px 6px;
      border: 1px solid #cbd5e1;
      font-size: 9.5px;
    }
    table.data-table tr:nth-child(even) {
      background: #f8fafc;
    }
    .totals-row td {
      background: #e2e8f0 !important;
      font-weight: 800;
      border-top: 2px solid #0f172a;
      font-size: 10px;
    }
    .signatures {
      margin-top: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
    }
    .sig-box {
      border-top: 1.5px solid #0f172a;
      padding-top: 6px;
      text-align: center;
      font-size: 9.5px;
    }
    .sig-title {
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 2px;
      font-size: 10px;
    }
    @media print {
      body { padding: 0; }
      .sheet { border: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <table class="header-table">
      <tr>
        <td style="width: 55%;">
          <h1 class="logo-title">SISTEMALOG SAS</h1>
          <p class="logo-sub">LATIN PRODUCTS S.A.S | CENTRO DE CONTROL LOGÍSTICO Y DESPACHO</p>
          <span style="font-size: 9px; color: #64748b;">ACOPI - YUMBO | NIT 900.852.147-3</span>
        </td>
        <td style="width: 45%; text-align: right;">
          <div class="badge-modalidad">
            ${tipo === 'CONSOLIDADO' ? '🚛 MANIFIESTO DE DESPACHO CONSOLIDADO' : '🚚 MANIFIESTO DE DESPACHO INDIVIDUAL'}
          </div>
          <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px;">
            N° ${manifiestoId}
          </div>
          <div style="font-size: 9px; color: #475569; margin-top: 2px;">
            Fecha Salida: <strong>${fechaSalida || todayStr}</strong> | Emisión: ${todayStr}
          </div>
        </td>
      </tr>
    </table>

    <!-- Ficha del Vehículo & Transportadora -->
    <table class="trip-card">
      <tr>
        <td style="width: 35%;">
          <span style="color: #64748b; display: block; font-size: 8.5px;">EMPRESA TRANSPORTADORA:</span>
          <strong>${transportadora || 'NO ASIGNADA'}</strong>
        </td>
        <td style="width: 20%;">
          <span style="color: #64748b; display: block; font-size: 8.5px;">PLACA VEHÍCULO:</span>
          <strong style="font-size: 12px; letter-spacing: 1px;">${placa || 'N/A'}</strong>
        </td>
        <td style="width: 45%;">
          <span style="color: #64748b; display: block; font-size: 8.5px;">CONDUCTOR & CELULAR:</span>
          <strong>${conductor || 'N/A'}</strong> ${celular ? `(Tel: ${celular})` : ''}
        </td>
      </tr>
      <tr>
        <td>
          <span style="color: #64748b; display: block; font-size: 8.5px;">FLETE TOTAL DEL VIAJE PACTADO:</span>
          <strong style="color: #0f172a; font-size: 12px;">$ ${Number(fleteEfectivo).toLocaleString('es-CO')} COP</strong>
        </td>
        <td>
          <span style="color: #64748b; display: block; font-size: 8.5px;">% FLETE S/ FACTURA GLOBAL:</span>
          <strong style="color: #047857; font-size: 11px;">${pctGlobal.toFixed(2)}%</strong>
          ${porcentajeFijado ? `<span style="font-size: 8.5px; color: #64748b;">(Fijado: ${porcentajeFijado.toFixed(2)}%)</span>` : ''}
        </td>
        <td>
          <span style="color: #64748b; display: block; font-size: 8.5px;">TOTAL ENTREGAS CONSOLIDADAS:</span>
          <strong>${orders.length} ${orders.length === 1 ? 'Pedido / Factura' : 'Pedidos / Facturas'}</strong>
        </td>
      </tr>
    </table>

    <!-- Tabla Detallada de Mercancía y Fletes Prorrateados -->
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 25px;">#</th>
          <th>ID / PV</th>
          <th>Factura</th>
          <th>Cliente Destinatario</th>
          <th>Destino</th>
          <th style="text-align: center;">Cajas</th>
          <th style="text-align: right;">Peso (kg)</th>
          <th style="text-align: right;">Facturado ($)</th>
          <th style="text-align: center;">% Part.</th>
          <th style="text-align: right;">Flete ($)</th>
          <th style="text-align: center;">% Fl/Fact</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="totals-row">
          <td colspan="5" style="text-align: right; padding-right: 8px;">TOTALES DEL VIAJE CONSOLIDADO:</td>
          <td style="text-align: center;">${totalCajas} cj</td>
          <td style="text-align: right;">${totalPeso.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
          <td style="text-align: right;">$ ${totalFacturado.toLocaleString('es-CO')}</td>
          <td style="text-align: center;">100.0%</td>
          <td style="text-align: right;">$ ${fleteEfectivo.toLocaleString('es-CO')}</td>
          <td style="text-align: center; color: #047857;">${pctGlobal.toFixed(2)}%</td>
        </tr>
      </tbody>
    </table>

    ${observaciones ? `
      <div style="border: 1px dashed #cbd5e1; padding: 6px 10px; margin-bottom: 12px; font-size: 9px;">
        <strong>Observaciones Generales de Ruta / Novedad:</strong> ${observaciones}
      </div>
    ` : ''}

    <!-- Firmas Legales de Responsabilidad -->
    <div class="signatures">
      <div class="sig-box">
        <div style="height: 38px;"></div>
        <div class="sig-title">DESPACHADO EN MUELLE</div>
        <div>Julián Barrios / Auxiliar de Despacho</div>
        <div style="font-size: 8px; color: #64748b;">SISTEMALOG SAS</div>
      </div>
      <div class="sig-box">
        <div style="height: 38px;"></div>
        <div class="sig-title">TRANSPORTADOR / CONDUCTOR</div>
        <div>${conductor || 'Firma Conductor'}</div>
        <div style="font-size: 8px; color: #64748b;">Placa: ${placa || '---'}</div>
      </div>
      <div class="sig-box">
        <div style="height: 38px;"></div>
        <div class="sig-title">COORDINACIÓN LOGÍSTICA</div>
        <div>Diana M. Agudelo / Washington Quiñones</div>
        <div style="font-size: 8px; color: #64748b;">Aprobación y Control</div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    }
  </script>
</body>
</html>
  `;

  // Use invisible iframe to print without triggering popup blocker or window.open errors
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Error invoking print on iframe', e);
      }
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 3000);
    }, 450);
  }
}
