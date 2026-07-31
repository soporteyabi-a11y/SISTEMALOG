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
