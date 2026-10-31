import { Order } from '../types';

/**
 * Normalizes text by converting to lowercase and removing accent marks / diacritics.
 */
export const normalizeText = (text: any): string => {
  if (text === undefined || text === null) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

/**
 * Universal search matcher for Order records.
 * Supports exact terms, case & accent-insensitive substring matching,
 * multi-keyword searches, prefix matching (e.g., "PV 102450", "FACTURA 4589"),
 * and clean matching (ignoring spaces, dashes, slashes, dots).
 */
export const matchOrderSearch = (o: Order, rawTerm: string): boolean => {
  if (!rawTerm || !rawTerm.trim()) return true;

  const rawClean = rawTerm.trim().toLowerCase();

  // Strip common field prefix prefixes if typed by user (e.g., "PV 102450", "FACTURA 4589", "OC-9912")
  const strippedTerm = rawClean
    .replace(/^(pv|factura|fact|oc|fe|fp|solic|solicitud|orden|pedido)[:\s\-]*/i, '')
    .trim();

  // Split query into individual normalized words
  const words = rawClean
    .split(/\s+/)
    .map(w => normalizeText(w))
    .filter(Boolean);

  if (words.length === 0) return true;

  // Gather all fields into a single searchable string
  const oAny = o as any;
  const fields = [
    o.id,
    o.pv,
    o.oc,
    o.cliente,
    o.ciudad,
    o.transportadora,
    o.factura,
    o.provision,
    o.placa,
    o.conductor,
    o.obs,
    o.fechaIngreso,
    o.fechaSalida,
    o.fechaFactura,
    o.direccion,
    o.estado,
    oAny.flete,
    oAny.guias,
    oAny.guia,
    oAny.guia1,
    oAny.guia2,
    oAny.guia3,
    oAny.guia4,
    oAny.unidades,
    oAny.tipo
  ];

  // Also include prefix-aware text tags so searching "pv:102450" or "factura 8840" matches
  const prefixTags = [
    `pv ${o.pv}`, `pv:${o.pv}`,
    `factura ${o.factura}`, `factura:${o.factura}`, `fact ${o.factura}`,
    `oc ${o.oc}`, `oc:${o.oc}`,
    `sol ${o.id}`, `solicitud ${o.id}`,
    `provision ${o.provision}`, `fp ${o.provision}`
  ].join(' ');

  const fullNormalizedText = normalizeText(fields.filter(val => val !== undefined && val !== null && val !== '').join(' ') + ' ' + prefixTags);
  const cleanFullText = fullNormalizedText.replace(/[\s\-_/.]/g, '');

  // 1. Every search word must match either fullNormalizedText or cleanFullText
  const wordsMatch = words.every(word => {
    // If the word is a generic field label prefix ("pv", "factura", "fact", "oc", etc.) and there are other terms in query, treat as matched
    if (['pv', 'factura', 'fact', 'oc', 'sol', 'solicitud', 'fp', 'fe', 'order'].includes(word) && words.length > 1) {
      return true;
    }
    const cleanWord = word.replace(/[\s\-_/.]/g, '');
    return (
      fullNormalizedText.includes(word) ||
      (cleanWord.length > 0 && cleanFullText.includes(cleanWord))
    );
  });

  if (wordsMatch) return true;

  // 2. Fallback check: if user entered "PV 102450", strippedTerm is "102450". Match stripped term!
  if (strippedTerm && strippedTerm !== rawClean) {
    const strippedNorm = normalizeText(strippedTerm);
    const strippedClean = strippedNorm.replace(/[\s\-_/.]/g, '');
    if (
      fullNormalizedText.includes(strippedNorm) ||
      (strippedClean.length > 0 && cleanFullText.includes(strippedClean))
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Calculates search relevance score for an order.
 * Higher scores mean closer matches (e.g., exact PV match receives top priority).
 */
export const getOrderSearchScore = (o: Order, rawTerm: string): number => {
  if (!rawTerm || !rawTerm.trim()) return 0;

  const term = normalizeText(rawTerm).trim();
  const cleanTerm = term.replace(/[\s\-_/.]/g, '');
  if (!term && !cleanTerm) return 0;

  let score = 0;
  const oAny = o as any;

  // 1. PV Match (Highest Priority)
  const pvNorm = normalizeText(o.pv);
  const pvClean = pvNorm.replace(/[\s\-_/.]/g, '');
  if (pvNorm === term || (cleanTerm.length > 0 && pvClean === cleanTerm)) {
    score += 10000;
  } else if (pvNorm.startsWith(term) || (cleanTerm.length > 0 && pvClean.startsWith(cleanTerm))) {
    score += 5000;
  } else if (pvNorm.includes(term) || (cleanTerm.length > 0 && pvClean.includes(cleanTerm))) {
    score += 3000;
  }

  // 2. Exact Match on OC / Factura / Order ID
  const ocNorm = normalizeText(o.oc);
  const ocClean = ocNorm.replace(/[\s\-_/.]/g, '');
  if (ocNorm === term || (cleanTerm.length > 0 && ocClean === cleanTerm)) {
    score += 8000;
  } else if (ocNorm.startsWith(term)) {
    score += 4000;
  }

  const factNorm = normalizeText(o.factura);
  const factClean = factNorm.replace(/[\s\-_/.]/g, '');
  if (factNorm === term || (cleanTerm.length > 0 && factClean === cleanTerm)) {
    score += 8000;
  } else if (factNorm.startsWith(term)) {
    score += 4000;
  }

  const idNorm = normalizeText(o.id);
  if (idNorm === term) {
    score += 8000;
  }

  // 3. Guia / Provision Match
  const guiaNorm = normalizeText(oAny.guia || oAny.guias || oAny.guia1 || '');
  if (guiaNorm === term) {
    score += 6000;
  } else if (guiaNorm.includes(term)) {
    score += 2000;
  }

  // 4. Cliente / Transportadora / Conductor
  const clienteNorm = normalizeText(o.cliente);
  if (clienteNorm === term) {
    score += 2000;
  } else if (clienteNorm.startsWith(term)) {
    score += 1000;
  }

  const transNorm = normalizeText(o.transportadora);
  if (transNorm === term) {
    score += 2000;
  }

  return score;
};

/**
 * Consolidates and deduplicates an array of orders.
 * Matches by ID, clean PV (+ Client), or clean Factura.
 * Merges missing data into the surviving record so no information is lost.
 */
export const deduplicateOrders = (ordersList: Order[]): { cleanedList: Order[]; removedCount: number; suspectedDuplicates?: any[] } => {
  if (!Array.isArray(ordersList)) return { cleanedList: [], removedCount: 0, suspectedDuplicates: [] };

  const seenIds = new Map<string, Order>();
  const result: Order[] = [];
  let removedCount = 0;
  const pvMap = new Map<string, Order>();
  const suspectedDuplicates: any[] = [];

  for (const rawO of ordersList) {
    if (!rawO) continue;
    const l = { ...rawO };
    if (l.id && seenIds.has(l.id)) {
      const v = seenIds.get(l.id)!;
      removedCount++;
      // Merge missing fields from l into existing record v
      if (!v.pv && l.pv) v.pv = l.pv;
      if (!v.oc && l.oc) v.oc = l.oc;
      if (!v.factura && l.factura) v.factura = l.factura;
      if (!v.cliente && l.cliente) v.cliente = l.cliente;
      if (!v.ciudad && l.ciudad) v.ciudad = l.ciudad;
      if (!v.placa && l.placa) v.placa = l.placa;
      if (!v.conductor && l.conductor) v.conductor = l.conductor;
      if (!v.celular && l.celular) v.celular = l.celular;
      if (!v.transportadora && l.transportadora) v.transportadora = l.transportadora;
      if (!v.flete && l.flete) v.flete = l.flete;
      if (!v.provision && l.provision) v.provision = l.provision;
      if (!v.venta && l.venta) v.venta = l.venta;
      if (!v.facturado && l.facturado) v.facturado = l.facturado;
      if (!v.cajas && l.cajas) v.cajas = l.cajas;
      if (!v.peso && l.peso) v.peso = l.peso;
      if (!v.cajasFact && l.cajasFact) v.cajasFact = l.cajasFact;
      if (!v.pesoFact && l.pesoFact) v.pesoFact = l.pesoFact;
      if (!v.fechaIngreso && l.fechaIngreso) v.fechaIngreso = l.fechaIngreso;
      if (!v.fechaSalida && l.fechaSalida) v.fechaSalida = l.fechaSalida;
      if (!v.fechaFactura && l.fechaFactura) v.fechaFactura = l.fechaFactura;
      if (!v.obs && l.obs) v.obs = l.obs;
      if (!(v as any).fechaEntregaReal && (l as any).fechaEntregaReal) (v as any).fechaEntregaReal = (l as any).fechaEntregaReal;
      if (!(v as any).fechaConfirmacion && (l as any).fechaConfirmacion) (v as any).fechaConfirmacion = (l as any).fechaConfirmacion;
      if (!(v as any).medioConfirmacion && (l as any).medioConfirmacion) (v as any).medioConfirmacion = (l as any).medioConfirmacion;
      if ((v as any).entregaCompleta === undefined && (l as any).entregaCompleta !== undefined) (v as any).entregaCompleta = (l as any).entregaCompleta;
      if (!(v as any).motivoFaltante && (l as any).motivoFaltante) (v as any).motivoFaltante = (l as any).motivoFaltante;
      if (!(v as any).confirmadoPor && (l as any).confirmadoPor) (v as any).confirmadoPor = (l as any).confirmadoPor;
      if ((v as any).entregaHistorica === undefined && (l as any).entregaHistorica !== undefined) (v as any).entregaHistorica = (l as any).entregaHistorica;
      if ((v as any).porRevisar === undefined && (l as any).porRevisar !== undefined) (v as any).porRevisar = (l as any).porRevisar;
      if (!(v as any).motivoRevision && (l as any).motivoRevision) (v as any).motivoRevision = (l as any).motivoRevision;
      (v as any).syncVersion = Math.max((v as any).syncVersion || 0, (l as any).syncVersion || 0);

      // Status precedence logic
      const statusPriority: Record<string, number> = {
        'Anulado': 0,
        'Pendiente': 1,
        'En Cargue': 2,
        'Despachado': 3,
        'En Sitio / Bodega': 4,
        'Entregado': 5,
        'Finalizado': 6
      };
      if ((statusPriority[l.estado] || 0) > (statusPriority[v.estado] || 0)) {
        v.estado = l.estado;
      }
      continue;
    }

    if (l.id) seenIds.set(l.id, l);
    result.push(l);

    // Track suspected duplicates without deleting distinct orders
    const d = l.pv ? String(l.pv).trim().toLowerCase() : '';
    const f = l.factura ? String(l.factura).trim().toLowerCase() : '';
    const h = l.cliente ? String(l.cliente).trim().toLowerCase() : '';
    const m = l.transportadora ? String(l.transportadora).trim().toLowerCase() : '';
    const isWeakFact = !f || f === 's/n' || f === 'sin' || f === '0' || f === 'sin factura' || f.length < 3;
    if (!(!d || d === 's/n' || d === '0' || d === 'sin pv' || d.length < 2) && !isWeakFact && h && m) {
      const vKey = `${d}|${f}|${h}|${m}`;
      if (pvMap.has(vKey)) {
        suspectedDuplicates.push({
          a: pvMap.get(vKey),
          b: l,
          reason: `Mismo PV="${l.pv}", Factura="${l.factura}", Cliente="${l.cliente}", Transportadora="${l.transportadora}"`
        });
      } else {
        pvMap.set(vKey, l);
      }
    }
  }

  return { cleanedList: result, removedCount, suspectedDuplicates };
};

/**
 * Sorts orders array descending by search relevance score.
 */
export const sortOrdersBySearchRelevance = (orders: Order[], rawTerm: string): Order[] => {
  if (!rawTerm || !rawTerm.trim()) return orders;

  return [...orders].sort((a, b) => {
    const scoreA = getOrderSearchScore(a, rawTerm);
    const scoreB = getOrderSearchScore(b, rawTerm);
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    return 0;
  });
};


