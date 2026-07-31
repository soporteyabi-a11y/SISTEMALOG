import React, { useState } from 'react';
import { Book, Copy, Moon, Sun, Download, MonitorDown } from 'lucide-react';

interface BookReportReaderProps {
  rawReport: string;
  onCopy: () => void;
  copied: boolean;
}

interface parsedSection {
  title: string;
  emoji: string;
  items: parsedItem[];
}

type parsedItem = 
  | { type: 'paragraph'; text: string }
  | { type: 'list-item'; text: string; subText?: string }
  | { type: 'region-block'; regionName: string; saleText: string; pendText: string }
  | { type: 'attention-box'; text: string; isClient: boolean };

export default function BookReportReader({ rawReport, onCopy, copied }: BookReportReaderProps) {
  // Theme state: 'cream' (elegant physical book paper) or 'hud-dark' (glowing cyber deck index)
  const [theme, setTheme] = useState<'cream' | 'hud-dark'>('cream');
  // Reading mode: 'all' (scrolling sheets) or 'bento' (interactive book tabs)
  const [activeTab, setActiveTab] = useState<number>(0);
  const [downloading, setDownloading] = useState(false);

  // Parse the structured report to render it dynamically
  const parseReport = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let title = 'INFORME DE GESTIÓN INTELIGENTE';
    let filterMes = 'Consolidado';
    const sections: parsedSection[] = [];
    
    let currentSection: parsedSection | null = null;
    let inRegionBlock = false;
    let tempRegionName = '';
    let tempRegionSale = '';

    lines.forEach((line) => {
      // Clean up markdown bold from headers
      const cleanLine = line.replace(/\*\*/g, '');

      // Identify Header
      if (cleanLine.includes('INFORME DE GESTIÓN INTELIGENTE')) {
        title = cleanLine.replace('📊', '').replace(/[\*]/g, '').trim();
        return;
      }
      if (cleanLine.includes('Filtro Mes:')) {
        filterMes = cleanLine.replace('📅', '').replace('Filtro Mes:', '').replace(/[\*]/g, '').trim();
        return;
      }
      if (line.startsWith('---')) {
        return; // skip decoration line
      }

      // Check for main section triggers (e.g. 💎 1, 🏢 2, 📈 3, 📦 4, 🏁 5)
      const sectionMatch = line.match(/^([💎🏢📈📦🏁])\s*\*?(\d+[\.\s\w\WáéíóúÁÉÍÓÚñÑ]+?)\*?$/) ||
                           line.match(/^([💎🏢📈📦🏁])\s+([12345]\.\s+.*)$/);
      
      if (sectionMatch || cleanLine.startsWith('1. RESUMEN') || cleanLine.startsWith('2. ANÁLISIS GEOGRÁFICO') || cleanLine.startsWith('3. EFICIENCIA') || cleanLine.startsWith('4. DINÁMICA') || cleanLine.startsWith('5. CONCLUSIÓN')) {
        if (currentSection) {
          sections.push(currentSection);
        }
        
        let secEmoji = '📔';
        let secTitle = cleanLine;
        
        if (sectionMatch) {
          secEmoji = sectionMatch[1];
          secTitle = sectionMatch[2].replace(/[\*]/g, '').trim();
        } else {
          // Fallback emojis
          if (cleanLine.includes('RESUMEN')) { secEmoji = '💎'; secTitle = '1. RESUMEN EJECUTIVO'; }
          else if (cleanLine.includes('GEOGRÁFICO') || cleanLine.includes('GEOGRAFICO')) { secEmoji = '🏢'; secTitle = '2. ANÁLISIS GEOGRÁFICO Y CLIENTES'; }
          else if (cleanLine.includes('EFICIENCIA')) { secEmoji = '📈'; secTitle = '3. EFICIENCIA Y METAS'; }
          else if (cleanLine.includes('DINÁMICA') || cleanLine.includes('DINAMICA')) { secEmoji = '📦'; secTitle = '4. DINÁMICA DE DESPACHOS'; }
          else if (cleanLine.includes('CONCLUSIÓN') || cleanLine.includes('CONCLUSION')) { secEmoji = '🏁'; secTitle = '5. CONCLUSIÓN Y ACCIÓN'; }
        }

        currentSection = {
          title: secTitle,
          emoji: secEmoji,
          items: []
        };
        inRegionBlock = false;
        return;
      }

      // If we don't have a current section, initialize a default one
      if (!currentSection) {
        currentSection = {
          title: 'Resumen Logístico',
          emoji: '📋',
          items: []
        };
      }

      // Parse Region blocks (📍 REGION:)
      if (line.includes('📍') || line.toLowerCase().includes('región:') || line.toLowerCase().includes('region:')) {
        inRegionBlock = true;
        tempRegionName = line.replace('📍', '').replace(/[\*]/g, '').trim();
        tempRegionSale = '';
        return;
      }

      // Parse inside Region Block
      if (inRegionBlock) {
        if (line.startsWith('• Venta:') || line.startsWith('• Venta')) {
          tempRegionSale = line.replace('•', '').trim();
          return;
        }
        if (line.startsWith('• Pend:') || line.startsWith('• Pendiente:') || line.startsWith('• Pend')) {
          const tempRegionPend = line.replace('•', '').trim();
          currentSection.items.push({
            type: 'region-block',
            regionName: tempRegionName,
            saleText: tempRegionSale || 'Venta: $0.00 (0.00 TON)',
            pendText: tempRegionPend
          });
          inRegionBlock = false; // end of 3-line region layout
          return;
        }
      }

      // Attention Box list items (under conclusion & action)
      if (line.startsWith('•') && (line.includes('Atención') || line.includes('Atencion') || line.includes('INSTA'))) {
        const isClient = line.includes('Cliente');
        currentSection.items.push({
          type: 'attention-box',
          text: line.replace('•', '').trim(),
          isClient
        });
        return;
      }

      // Regular list-item
      if (line.startsWith('•') || line.startsWith('-')) {
        currentSection.items.push({
          type: 'list-item',
          text: line.substring(1).trim()
        });
        return;
      }

      // Fallback: regular paragraph text
      currentSection.items.push({
        type: 'paragraph',
        text: line
      });
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    return { title, filterMes, sections };
  };

  const { title, filterMes, sections } = React.useMemo(() => parseReport(rawReport), [rawReport]);

  const visibleSections = React.useMemo(() => {
    if (activeTab === 0) {
      return sections.map((s, idx) => ({ ...s, index: idx }));
    }
    const target = sections[activeTab - 1];
    return target ? [{ ...target, index: activeTab - 1 }] : [];
  }, [sections, activeTab]);

  // Helper to highlight money/percentages beautifully with markup in spans
  const highlightValues = (text: string, isLightMode: boolean) => {
    // Regex matches monetary values, percentages, quantities in both US and Spanish/Colombian formats
    // e.g., $515,289,692.80, $25.050.000, 44.3%, 7,51% or 50.39 toneladas
    const regex = /(\$\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d+)?%|\d+(?:[.,]\d+)?\s*(?:toneladas|TON|cajas|kg|KG|ton))/gi;
    
    const parts = text.split(regex);
    if (parts.length === 1) return text;

    return (
      <span className="inline">
        {parts.map((part, index) => {
          if (part.match(regex)) {
            return (
              <span 
                key={`highlight-${index}-${part}`} 
                className={`px-1.5 py-0.5 rounded font-mono font-bold text-[11px] sm:text-xs inline-block ${
                  isLightMode 
                    ? 'bg-amber-100/80 text-amber-900 border border-amber-200/50' 
                    : 'bg-indigo-950/45 text-sky-400 border border-sky-900/40'
                }`}
              >
                {part}
              </span>
            );
          }
          return <span key={`text-${index}-${part}`}>{part}</span>;
        })}
      </span>
    );
  };

  // Safe client-side document download method for simple reports
  const handleDownloadReport = () => {
    try {
      setDownloading(true);
      const cleanDivider = '============================================================\n';
      let reportTxt = `${cleanDivider}           ${title} \n${cleanDivider}`;
      reportTxt += `Filtro Mes: ${filterMes}\n\n`;

      sections.forEach((sec, idx) => {
        reportTxt += `\n[Pag ${idx + 1}] ${sec.emoji} ${sec.title.toUpperCase()}\n`;
        reportTxt += `${'-'.repeat(40)}\n`;
        
        sec.items.forEach(item => {
          if (item.type === 'paragraph') {
            reportTxt += `${item.text}\n\n`;
          } else if (item.type === 'list-item') {
            reportTxt += `• ${item.text}\n`;
          } else if (item.type === 'region-block') {
            reportTxt += `📍 REGION: ${item.regionName}\n  - ${item.saleText}\n  - ${item.pendText}\n`;
          } else if (item.type === 'attention-box') {
            const flag = item.text.includes('INSTA') ? '🏁 [ACCION]' : '🚨 [ALERTA]';
            reportTxt += `${flag} ${item.text}\n`;
          }
        });
      });

      reportTxt += `\n${cleanDivider}Generado de forma segura por SISTEMALOG SAS - IA Auditoría\n${cleanDivider}`;

      const blob = new Blob([reportTxt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `informe_auditoria_sistemalog_${filterMes.replace(/\s+/g, '_')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  const isLight = theme === 'cream';

  return (
    <div className="space-y-4">
      {/* Hide scrollbars style utility */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none !important;
        }
        .no-scrollbar {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }
      `}</style>

      {/* Selector controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <Book className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold text-emerald-400 font-mono uppercase tracking-wider">
            Lectura Editorial Premium Activa
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Theme switch button */}
          <button
            type="button"
            onClick={() => setTheme(isLight ? 'hud-dark' : 'cream')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer border ${
              isLight 
                ? 'bg-[#1e293b] border-[#334155] text-slate-300 hover:text-white' 
                : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
            }`}
          >
            {isLight ? (
              <>
                <Moon className="w-3.5 h-3.5 text-blue-400 font-bold" /> Vista Terminal
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-600 font-bold" /> Vista Lujosa de Libro
              </>
            )}
          </button>

          {/* Copy Audit result */}
          <button
            type="button"
            onClick={onCopy}
            className="bg-[#091124] border border-[#1e293b] hover:border-[#334155] text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 uppercase cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-sky-400" /> 
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>

          {/* Download Report Button with custom beautiful styling */}
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={downloading}
            className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 uppercase cursor-pointer"
          >
            <MonitorDown className="w-3.5 h-3.5" />
            {downloading ? 'Descargando...' : 'Descargar'}
          </button>
        </div>
      </div>

      {/* Main physical Book Layout */}
      <div 
        className={`w-full rounded-2xl shadow-2xl transition-all duration-500 overflow-hidden border ${
          isLight 
            ? 'bg-gradient-to-br from-[#fdfbf7] via-[#f7f2e5] to-[#ece3cb] border-[#dfd2be] text-[#2d2a26] shadow-amber-950/25' 
            : 'bg-gradient-to-b from-slate-950 to-[#030914] border-[#1e293b] text-slate-100 shadow-black/80'
        }`}
      >
        {/* Book Spine header decoration */}
        <div className={`h-2 text-full ${isLight ? 'bg-gradient-to-r from-amber-800 via-amber-600 to-amber-800 opacity-80' : 'bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-500'}`} />

        <div className="p-4 sm:p-6 md:p-10 space-y-6 md:space-y-8">
          
          {/* Header page letterhead */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-dashed gap-4 align-middle"
               style={{ borderColor: isLight ? '#cad2c5' : '#1e293b' }}
          >
            <div className="space-y-1 w-full md:max-w-[70%]">
              <span className={`text-[10px] font-mono tracking-widest uppercase font-bold block ${isLight ? 'text-amber-800' : 'text-sky-400'}`}>
                📔 REPORTE EJECUTIVO CERTIFICADO POR IA (GEMINI 3.5)
              </span>
              <h1 className="text-lg sm:text-xl md:text-2xl font-serif font-black tracking-tight leading-snug">
                {title}
              </h1>
            </div>

            <div className={`p-3 rounded-lg text-xs font-mono border w-full md:w-auto ${
              isLight 
                ? 'bg-[#f3ead3] border-[#ccd1c6] text-amber-950' 
                : 'bg-slate-900 border-[#1e293b] text-slate-300'
            }`}>
              <div className="font-bold flex items-center gap-1.5">
                <span className="animate-pulse">📅</span> Filtro Mes:
              </div>
              <div className="text-[12px] font-bold tracking-tight text-right mt-1 block">
                {filterMes}
              </div>
            </div>
          </div>

          {/* Book Index Tabs - Scrollable horizontally with hidden scrollbar on cell phones */}
          <div 
            className="flex gap-1.5 pb-2 border-b overflow-x-auto no-scrollbar select-none" 
            style={{ 
              borderColor: isLight ? '#eae5d4' : '#1e293b'
            }}
          >
            <button
               type="button"
               onClick={() => setActiveTab(0)}
               className={`px-3 py-1.5 rounded-lg font-mono text-[9px] sm:text-[10px] uppercase font-bold tracking-wider transition-all duration-300 cursor-pointer whitespace-nowrap ${
                 activeTab === 0
                   ? isLight 
                     ? 'bg-amber-950 text-white shadow-md' 
                     : 'bg-[#00d2ff] text-slate-950 shadow-md'
                   : isLight 
                     ? 'bg-[#ebdfc5] text-amber-900 hover:bg-[#dfd3b5]' 
                     : 'bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-900'
               }`}
            >
              📖 Todo el Libro
            </button>
            {sections.map((sec, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => setActiveTab(idx + 1)}
                className={`px-3 py-1.5 rounded-lg font-mono text-[9px] sm:text-[10px] uppercase font-bold tracking-wider transition-all duration-300 cursor-pointer whitespace-nowrap ${
                  activeTab === (idx + 1)
                    ? isLight 
                      ? 'bg-amber-950 text-white shadow-md' 
                      : 'bg-[#00d2ff] text-slate-950 shadow-md'
                    : isLight 
                      ? 'bg-[#ebdfc5] text-amber-900 hover:bg-[#dfd3b5]' 
                      : 'bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-900'
                }`}
              >
                <span>{sec.emoji} Pag {idx + 1}</span>
              </button>
            ))}
          </div>

          {/* Core Content Area */}
          <div className={`space-y-8 sm:space-y-10 ${isLight ? 'font-serif' : 'font-sans'}`}>
            
            {visibleSections.map((section) => {
              return (
                <div 
                  key={`sec-${section.index}`} 
                  className={`space-y-4 sm:space-y-5 animate-fade-in pb-6 sm:pb-8 border-b last:border-0 ${
                    isLight ? 'border-amber-900/10' : 'border-slate-900'
                  }`}
                >
                  {/* Section Title Card */}
                  <div className="flex items-center gap-3">
                    <span className={`text-xl sm:text-2xl p-2 rounded-xl flex items-center justify-center ${
                      isLight ? 'bg-amber-100 shadow-inner' : 'bg-slate-900 border border-slate-800'
                    }`}>
                      {section.emoji}
                    </span>
                    <h2 className="text-base sm:text-lg md:text-xl font-bold font-serif tracking-tight flex items-center gap-2">
                      {section.title}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 gap-4 text-xs sm:text-sm leading-relaxed max-w-4xl">
                    {section.items.map((item, itemIdx) => {
                      if (item.type === 'paragraph') {
                        return (
                          <p 
                            key={`p-${itemIdx}`} 
                            className={`indent-4 text-xs sm:text-[14px] leading-relaxed tracking-wide text-justify ${
                              isLight ? 'text-slate-800' : 'text-[#cbd5e1]'
                            }`}
                          >
                            {highlightValues(item.text, isLight)}
                          </p>
                        );
                      }

                      if (item.type === 'list-item') {
                        return (
                          <div key={`li-${itemIdx}`} className="flex items-start gap-2 pl-2 sm:pl-4 py-1">
                            <span className={`text-xs mt-1 shrink-0 ${isLight ? 'text-amber-700' : 'text-sky-400'}`}>✦</span>
                            <p className={`text-xs sm:text-[13.5px] leading-relaxed text-justify ${isLight ? 'text-slate-800' : 'text-[#cbd5e1]'}`}>
                              {highlightValues(item.text, isLight)}
                            </p>
                          </div>
                        );
                      }

                      if (item.type === 'region-block') {
                        return (
                          <div 
                            key={`reg-${itemIdx}`}
                            className={`p-3 pl-3.5 rounded-xl border transition-all hover:scale-[1.01] ${
                              isLight 
                                ? 'bg-amber-50/40 border-[#dfd2be] hover:bg-[#fcfaf4]' 
                                : 'bg-slate-950/40 border-slate-900 hover:border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm">📍</span>
                              <span className="font-mono text-[9px] sm:text-xs font-black uppercase tracking-wider">
                                {item.regionName}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] sm:text-xs font-mono">
                              <div className="flex justify-between sm:justify-start gap-2 items-center">
                                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Venta:</span>
                                <span className="font-bold">{highlightValues(item.saleText, isLight)}</span>
                              </div>
                              <div className="flex justify-between sm:justify-start gap-2 items-center border-t sm:border-t-0 sm:border-l pt-1 sm:pt-0 sm:pl-3"
                                   style={{ borderColor: isLight ? '#ead8b5' : '#1e293b' }}
                              >
                                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Pendiente:</span>
                                <span className="font-bold">{highlightValues(item.pendText, isLight)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (item.type === 'attention-box') {
                        const isAction = item.text.includes('INSTA');
                        return (
                          <div 
                            key={`att-${itemIdx}`}
                            className={`p-4 rounded-xl border-l-4 shadow-sm flex items-start gap-3 my-2 ${
                              isAction
                                ? isLight 
                                  ? 'bg-emerald-50 border-emerald-600 text-emerald-950 shadow-emerald-900/5' 
                                  : 'bg-emerald-950/20 border-emerald-500 text-emerald-100'
                                : isLight
                                  ? 'bg-rose-50 border-rose-600 text-rose-950 shadow-rose-900/5'
                                  : 'bg-rose-950/20 border-rose-500 text-rose-100'
                            }`}
                          >
                            <span className="text-base sm:text-lg mt-0.5">{isAction ? '🏁' : '🚨'}</span>
                            <div className="space-y-0.5">
                              <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-widest font-black block select-none">
                                {isAction ? 'ACCIÓN OPERATIVA RECOMENDADA' : 'AUDITORÍA CRÍTICA DE ATENCIÓN'}
                              </span>
                              <p className="text-xs sm:text-[13px] leading-relaxed">
                                {highlightValues(item.text, isLight)}
                              </p>
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </div>
              );
            })}

          </div>

          {/* Book Footer Pagination */}
          <div className="flex flex-col sm:flex-row justify-between items-center pt-8 border-t gap-3" style={{ borderColor: isLight ? '#cad2c5' : '#1e293b' }}>
            <div className="text-[9px] sm:text-[10px] font-mono uppercase text-slate-500 font-bold block text-center sm:text-left">
              SISTEMALOG SAS - Auditoría Inteligente
            </div>
            
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono">
              <span className={isLight ? 'text-amber-900 font-black' : 'text-sky-400 font-black'}>
                {activeTab === 0 ? 'Lectura Continua' : `Página ${activeTab} de ${sections.length}`}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
