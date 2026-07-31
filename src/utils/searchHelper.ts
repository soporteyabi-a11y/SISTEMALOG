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
export const deduplicateOrders = (ordersList: Order[]): { cleanedList: Order[]; removedCount: number } => {
  if (!Array.isArray(ordersList)) return { cleanedList: [], removedCount: 0 };

  const seenIds = new Set<string>();
  const seenPvs = new Map<string, Order>();
  const seenFacturas = new Map<string, Order>();
  const result: Order[] = [];
  let removedCount = 0;

  for (const rawO of ordersList) {
    if (!rawO) continue;
    const o = { ...rawO };
    const normPv = o.pv ? String(o.pv).trim().toLowerCase() : '';
    const normFact = o.factura ? String(o.factura).trim().toLowerCase() : '';
    
    // Ignore generic/placeholder strings
    const cleanPv = (normPv && normPv !== 's/n' && normPv !== 'sin' && normPv !== '0' && normPv !== 'sin pv') ? normPv : '';
    const cleanFact = (normFact && normFact !== 's/n' && normFact !== 'sin' && normFact !== '0' && normFact !== 'sin factura') ? normFact : '';
    const clientKey = o.cliente ? String(o.cliente).trim().toLowerCase() : '';

    let existing: Order | undefined = undefined;

    // 1. Check matching by ID
    if (o.id && seenIds.has(o.id)) {
      existing = result.find(r => r.id === o.id);
    } 
    // 2. Check matching by PV + Client (if PV present)
    else if (cleanPv && clientKey && seenPvs.has(`${cleanPv}_${clientKey}`)) {
      existing = seenPvs.get(`${cleanPv}_${clientKey}`);
    }
    // 3. Check matching by PV alone (if PV has at least 2 chars)
    else if (cleanPv && cleanPv.length >= 2 && seenPvs.has(cleanPv)) {
      existing = seenPvs.get(cleanPv);
    }
    // 4. Check matching by Factura (if Factura present)
    else if (cleanFact && cleanFact.length >= 2 && seenFacturas.has(cleanFact)) {
      existing = seenFacturas.get(cleanFact);
    }

    if (existing) {
      removedCount++;
      // Merge non-empty fields from 'o' into 'existing'
      if (!existing.pv && o.pv) existing.pv = o.pv;
      if (!existing.oc && o.oc) existing.oc = o.oc;
      if (!existing.factura && o.factura) existing.factura = o.factura;
      if (!existing.cliente && o.cliente) existing.cliente = o.cliente;
      if (!existing.ciudad && o.ciudad) existing.ciudad = o.ciudad;
      if (!existing.placa && o.placa) existing.placa = o.placa;
      if (!existing.conductor && o.conductor) existing.conductor = o.conductor;
      if (!existing.celular && o.celular) existing.celular = o.celular;
      if (!existing.transportadora && o.transportadora) existing.transportadora = o.transportadora;
      if (!existing.flete && o.flete) existing.flete = o.flete;
      if (!existing.provision && o.provision) existing.provision = o.provision;
      if (!existing.venta && o.venta) existing.venta = o.venta;
      if (!existing.facturado && o.facturado) existing.facturado = o.facturado;
      if (!existing.cajas && o.cajas) existing.cajas = o.cajas;
      if (!existing.peso && o.peso) existing.peso = o.peso;
      if (!existing.cajasFact && o.cajasFact) existing.cajasFact = o.cajasFact;
      if (!existing.pesoFact && o.pesoFact) existing.pesoFact = o.pesoFact;
      if (!existing.fechaIngreso && o.fechaIngreso) existing.fechaIngreso = o.fechaIngreso;
      if (!existing.fechaSalida && o.fechaSalida) existing.fechaSalida = o.fechaSalida;
      if (!existing.fechaFactura && o.fechaFactura) existing.fechaFactura = o.fechaFactura;
      if (!existing.obs && o.obs) existing.obs = o.obs;

      // Status precedence logic (prefer active states like Despachado / Entregado over Pendiente)
      const statusPriority: Record<string, number> = {
        'Anulado': 0,
        'Pendiente': 1,
        'En Cargue': 2,
        'Despachado': 3,
        'En Sitio / Bodega': 4,
        'Entregado': 5,
        'Finalizado': 6
      };
      if ((statusPriority[o.estado] || 0) > (statusPriority[existing.estado] || 0)) {
        existing.estado = o.estado;
      }
    } else {
      if (o.id) seenIds.add(o.id);
      if (cleanPv) {
        seenPvs.set(cleanPv, o);
        if (clientKey) seenPvs.set(`${cleanPv}_${clientKey}`, o);
      }
      if (cleanFact) {
        seenFacturas.set(cleanFact, o);
      }
      result.push(o);
    }
  }

  return { cleanedList: result, removedCount };
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


