export function generateAppStructurePdf() {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes (popups) para abrir el PDF.');
    return;
  }

  const currentDate = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Manual de Estructura y Funcionamiento - Logistics Platform v2.0</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');

    @page {
      size: letter portrait;
      margin: 18mm 15mm 18mm 15mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      line-height: 1.5;
      font-size: 11pt;
    }

    /* Print toolbar */
    .no-print-bar {
      position: sticky;
      top: 0;
      background-color: #0f172a;
      color: #ffffff;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      border-bottom: 2px solid #38bdf8;
    }

    .no-print-bar h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 0.5px;
    }

    .btn-print {
      background-color: #0284c7;
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .btn-print:hover {
      background-color: #0369a1;
    }

    .document-container {
      max-width: 820px;
      margin: 20px auto;
      padding: 30px;
      background: #ffffff;
    }

    /* Header & Cover */
    .cover-header {
      border-bottom: 3px solid #0284c7;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    .brand-tag {
      display: inline-block;
      background-color: #e0f2fe;
      color: #0369a1;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9pt;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }

    .doc-title {
      font-size: 24pt;
      font-weight: 900;
      color: #0f172a;
      margin: 0 0 8px 0;
      letter-spacing: -0.5px;
      line-height: 1.15;
    }

    .doc-subtitle {
      font-size: 12pt;
      color: #475569;
      margin: 0 0 16px 0;
      font-weight: 500;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 9pt;
    }

    .meta-item label {
      display: block;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 7.5pt;
      margin-bottom: 2px;
    }

    .meta-item span {
      font-weight: 700;
      color: #0f172a;
    }

    /* Section Styling */
    .section-title {
      font-size: 14pt;
      font-weight: 800;
      color: #0f172a;
      border-left: 4px solid #0284c7;
      padding-left: 10px;
      margin: 30px 0 15px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      page-break-after: avoid;
    }

    p {
      margin: 0 0 12px 0;
      color: #334155;
      text-align: justify;
    }

    /* Cards & Grids */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    .card {
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 14px;
    }

    .card-title {
      font-size: 11pt;
      font-weight: 700;
      color: #0369a1;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .card p {
      font-size: 9.5pt;
      color: #475569;
      margin: 0;
    }

    /* Table Styling */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0 25px 0;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }

    th {
      background-color: #0f172a;
      color: #ffffff;
      text-align: left;
      padding: 8px 12px;
      font-weight: 700;
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    td {
      padding: 9px 12px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
      vertical-align: top;
    }

    tr:nth-child(even) td {
      background-color: #f8fafc;
    }

    .module-badge {
      display: inline-block;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 8pt;
      padding: 2px 6px;
      border-radius: 4px;
      background-color: #e0f2fe;
      color: #0369a1;
    }

    /* Diagram Workflow List */
    .workflow-list {
      list-style: none;
      padding: 0;
      margin: 15px 0;
    }

    .workflow-step {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background-color: #f1f5f9;
      border-left: 3px solid #0284c7;
      padding: 10px 14px;
      margin-bottom: 8px;
      border-radius: 0 6px 6px 0;
      page-break-inside: avoid;
    }

    .step-num {
      background-color: #0284c7;
      color: #ffffff;
      font-weight: 800;
      font-size: 9pt;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .step-text strong {
      color: #0f172a;
      font-size: 10pt;
    }

    .step-text p {
      font-size: 9pt;
      margin: 2px 0 0 0;
      color: #475569;
    }

    /* Highlight callout */
    .callout-box {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-left: 4px solid #16a34a;
      padding: 12px 16px;
      border-radius: 6px;
      margin: 15px 0;
      font-size: 9.5pt;
      color: #14532d;
      page-break-inside: avoid;
    }

    .callout-box strong {
      color: #15803d;
    }

    /* Page Footer */
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 15px;
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8pt;
      color: #94a3b8;
      font-family: 'JetBrains Mono', monospace;
    }

    @media print {
      .no-print-bar {
        display: none !important;
      }
      .document-container {
        margin: 0;
        padding: 0;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>

  <!-- Printable Toolbar -->
  <div class="no-print-bar">
    <h2>DOCUMENTACIÓN TÉCNICA Y OPERATIVA LOGISTICS PLATFORM</h2>
    <button class="btn-print" onclick="window.print()">
      🖨️ IMPRIMIR / GUARDAR COMO PDF
    </button>
  </div>

  <div class="document-container">

    <!-- Cover / Header -->
    <div class="cover-header">
      <div class="brand-tag">SISTEMA DE GESTIÓN LOGÍSTICA & DESPACHOS V2.0</div>
      <h1 class="doc-title">Manual de Estructura y Funcionamiento del Sistema</h1>
      <p class="doc-subtitle">
        Arquitectura de Software, Módulos Operativos, Motor de Sincronización Transaccional y Flujo de Información.
      </p>

      <div class="meta-grid">
        <div class="meta-item">
          <label>FECHA DE EMISIÓN</label>
          <span>${currentDate}</span>
        </div>
        <div class="meta-item">
          <label>VERSIÓN ARQUITECTURA</label>
          <span>v2.0 (Sync Resilient)</span>
        </div>
        <div class="meta-item">
          <label>MOTOR DE BASE DE DATOS</label>
          <span>Firestore Cloud + LocalStorage</span>
        </div>
      </div>
    </div>

    <!-- Section 1 -->
    <h2 class="section-title">1. ARQUITECTURA GENERAL Y PILA TECNOLÓGICA</h2>
    <p>
      La aplicación <strong>Logistics Platform</strong> es un sistema de gestión logístico integral diseñado para optimizar el control de despachos, liquidación de fletes, seguimiento de novedades y análisis de rendimiento operativo. Opera bajo una arquitectura híbrida desacoplada orientada a la disponibilidad del 100% y cero pérdida de datos.
    </p>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">💻 Frontend & Interfaz</div>
        <p>
          Construido en <strong>React 18</strong> con <strong>TypeScript</strong> y <strong>Tailwind CSS</strong>. Ofrece una interfaz estilo HUD interactivo de alta visibilidad, responsiva y optimizada para la operación continua en centros de distribución.
        </p>
      </div>

      <div class="card">
        <div class="card-title">☁️ Backend & Persistencia Híbrida</div>
        <p>
          Base de datos distribuida <strong>Google Cloud Firestore</strong> sincronizada en tiempo real, respaldada por un sistema de cache local en <strong>LocalStorage</strong> para garantizar operación ininterrumpida ante fallos de red.
        </p>
      </div>
    </div>

    <!-- Section 2 -->
    <h2 class="section-title">2. MOTOR DE SINCRONIZACIÓN TRANSACCIONAL Y RESILIENCIA (SYNC QUEUE)</h2>
    <p>
      Para prevenir cualquier pérdida de información entre los módulos de <strong>Despacho → Provisiones → Análisis de Datos</strong>, la plataforma implementa los siguientes 7 principios de resiliencia:
    </p>

    <table>
      <thead>
        <tr>
          <th>Principio</th>
          <th>Descripción y Funcionamiento Técnico</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>1. Escrituras Atómicas</strong></td>
          <td>Garantiza mediante lotes atómicos (<code>writeBatch</code>) que los cambios en un registro y sus réplicas asociadas se guarden juntos o ninguno.</td>
        </tr>
        <tr>
          <td><strong>2. Cola de Eventos (Sync Queue)</strong></td>
          <td>Cada cambio crítico registra un evento en la cola persistente con estado <code>pending</code>, <code>processing</code>, <code>processed</code> o <code>failed</code>.</td>
        </tr>
        <tr>
          <td><strong>3. Reintentos Exponenciales</strong></td>
          <td>Si falla la red o cuotas de Firebase, el motor reintenta automáticamente con retroceso exponencial (2s, 4s, 8s, 16s...).</td>
        </tr>
        <tr>
          <td><strong>4. Idempotencia Garantizada</strong></td>
          <td>Utiliza claves únicas (<code>IdempotencyKey</code>) basadas en el ID de Orden, PV o Factura para evitar duplicar registros en reintentos.</td>
        </tr>
        <tr>
          <td><strong>5. Auditoría y Logs Visibles</strong></td>
          <td>Registra cada sincronización con timestamp, módulo de origen, destino y mensajes de error detallados visibles en el monitor técnico.</td>
        </tr>
        <tr>
          <td><strong>6. Reconciliación Automática</strong></td>
          <td>Algoritmo de auditoría que verifica que todas las órdenes despachadas tengan su comprobante de provisión correspondiente.</td>
        </tr>
        <tr>
          <td><strong>7. Copias de Seguridad JSON</strong></td>
          <td>Módulo de descarga e importación directa de backup en formato JSON para punto de restauración inmediato.</td>
        </tr>
      </tbody>
    </table>

    <!-- Section 3 -->
    <h2 class="section-title">3. ESTRUCTURA Y MÓDULOS DEL SISTEMA</h2>
    <p>
      El sistema está compuesto por 8 módulos principales interconectados en tiempo real:
    </p>

    <table>
      <thead>
        <tr>
          <th style="width: 25%;">Módulo</th>
          <th>Función Principal y Operatividad</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="module-badge">Despachos</span></td>
          <td>Control de solicitudes de servicio, asignación de vehículos, fletes, transportadoras, cargue masivo Excel y extracción IA de remesas PDF con Gemini.</td>
        </tr>
        <tr>
          <td><span class="module-badge">Provisiones</span></td>
          <td>Cálculo automático y contabilización de provisiones de flete por transportadora, actualización de costos reales e impresión de comprobantes.</td>
        </tr>
        <tr>
          <td><span class="module-badge">Análisis de Datos</span></td>
          <td>Dashboard de KPIs logísticos en tiempo real: Tonelaje, número de cajas, costo medio por flete, desempeño por transportadora y destino.</td>
        </tr>
        <tr>
          <td><span class="module-badge">Novedades</span></td>
          <td>Registro y trazabilidad de incidencias en carretera (devoluciones, averías, retrasos) vinculadas directamente a la orden.</td>
        </tr>
        <tr>
          <td><span class="module-badge">Citas</span></td>
          <td>Programación de turnos y agendamiento de citas para entregas en almacenes de cadena y plataformas logísticas.</td>
        </tr>
        <tr>
          <td><span class="module-badge">Control de Horas</span></td>
          <td>Registro de tiempos de permanencia en bodega, tiempos de cargue y tiempo en sitio para evitar cobro de sobretiempos.</td>
        </tr>
        <tr>
          <td><span class="module-badge">Liquidador</span></td>
          <td>Módulo de auditoría de facturas emitidas por transportadoras contra los fletes pactados en la orden original.</td>
        </tr>
        <tr>
          <td><span class="module-badge">Vehículos</span></td>
          <td>Catálogo y hojas de vida de conductores, placas, tipos de vehículo y estado de validación documental.</td>
        </tr>
      </tbody>
    </table>

    <!-- Section 4 -->
    <h2 class="section-title">4. FLUJO DE TRABAJO PASO A PASO</h2>

    <ul class="workflow-list">
      <li class="workflow-step">
        <div class="step-num">1</div>
        <div class="step-text">
          <strong>Ingreso o Importación de la Orden:</strong>
          <p>La orden se crea manualmente, se importa masivamente vía Excel/CSV con deduplicación automática, o se arrastra un archivo PDF de Remesa/Factura para extracción de datos por Inteligencia Artificial.</p>
        </div>
      </li>

      <li class="workflow-step">
        <div class="step-num">2</div>
        <div class="step-text">
          <strong>Asignación de Vehículo & Transportadora:</strong>
          <p>Se valida la ruta, ciudad de destino, conductor, placa y valor del flete sugerido o pactado según la tabla de tarifas.</p>
        </div>
      </li>

      <li class="workflow-step">
        <div class="step-num">3</div>
        <div class="step-text">
          <strong>Sincronización Transaccional Atómica:</strong>
          <p>Al pasar el estado a "Despachado", el evento ingresa a la cola de sincronización para actualizar automáticamente el presupuesto en Provisiones y recalcular KPIs en Análisis.</p>
        </div>
      </li>

      <li class="workflow-step">
        <div class="step-num">4</div>
        <div class="step-text">
          <strong>Liquidación y Cierre del Servicio:</strong>
          <p>Se audita la factura de la transportadora en el Liquidador para confirmar que no existan cobros superiores a lo provisionado originalmente.</p>
        </div>
      </li>
    </ul>

    <div class="callout-box">
      <strong>💡 Nota de Seguridad Operativa:</strong> Todos los cambios realizados en el sistema cuentan con auditoría de usuario, fecha y hora de modificación, permitiendo rastrear el historial completo de cualquier pedido o flete en la organización.
    </div>

    <!-- Footer -->
    <div class="footer">
      <div>LOGISTICS PLATFORM V2.0 - MANUAL DE ESTRUCTURA</div>
      <div>PÁGINA 1 DE 1</div>
      <div>SISTEMA DE GESTIÓN INTEGRAL</div>
    </div>

  </div>

  <script>
    // Auto trigger print dialog on page load
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 600);
    });
  </script>
</body>
</html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
