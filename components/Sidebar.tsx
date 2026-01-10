
import React, { useState, useEffect, useRef } from 'react';
import { LayerData } from '../types';
import { Layers, Info, ChevronRight, ChevronLeft, Image as ImageIcon, Edit2, Video as VideoIcon, Sliders, Cpu, Loader2, AlertCircle, StickyNote, BoxSelect, Pencil, Type as TypeIcon, Folder, FolderOpen, CornerDownRight, Mic, Trash2, Download, Copy, ChevronDown, Check } from 'lucide-react';

type ExportFormat = 'png' | 'jpg' | 'mp4' | 'wav';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  layers: LayerData[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onRenameLayer: (id: string, newName: string) => void;
  onLayerDoubleClick: (id: string) => void;
  onDeleteLayer?: (id: string) => void;
  onExportLayer?: (id: string, format: ExportFormat) => void;
  onDuplicateLayer?: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle, layers, selectedLayerId, onSelectLayer, onRenameLayer, onLayerDoubleClick, onDeleteLayer, onExportLayer, onDuplicateLayer }) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'properties'>('layers');
  const [editingName, setEditingName] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [exportMenuLayerId, setExportMenuLayerId] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuLayerId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getExportFormats = (layer: LayerData): ExportFormat[] => {
    if (layer.type === 'video') return ['mp4'];
    if (layer.type === 'audio') return ['wav'];
    if (layer.type === 'image' || layer.type === 'sticky' || layer.type === 'text' || layer.type === 'drawing') return ['png', 'jpg'];
    return [];
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  useEffect(() => {
    if (selectedLayer) {
      setEditingName(selectedLayer.title);
    }
  }, [selectedLayer]);

  const handleNameBlur = () => {
    if (selectedLayer && editingName.trim() !== '') {
      onRenameLayer(selectedLayer.id, editingName);
    } else if (selectedLayer) {
      setEditingName(selectedLayer.title);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  const toggleGroup = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedGroups(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
      });
  };

  const formatDuration = (secs?: number) => {
      if (!secs) return '-';
      return `${Math.round(secs * 10) / 10}s`;
  };

  // Warm Ember themed icons
  const renderLayerIcon = (type: string) => {
      switch(type) {
          case 'image': return <ImageIcon size={14} className="text-primary"/>;
          case 'video': return <VideoIcon size={14} className="text-violet-400"/>;
          case 'audio': return <Mic size={14} className="text-emerald-400"/>;
          case 'sticky': return <StickyNote size={14} className="text-amber-300"/>;
          case 'group': return <BoxSelect size={14} className="text-stone-400"/>;
          case 'drawing': return <Pencil size={14} className="text-rose-400"/>;
          case 'text': return <TypeIcon size={14} className="text-stone-100"/>;
          default: return <Layers size={14} className="text-stone-400"/>;
      }
  };

  const canDownload = (layer: LayerData) => layer.type === 'image' || layer.type === 'video' || layer.type === 'audio';
  const canDuplicate = (layer: LayerData) => layer.type !== 'group';

  const renderLayerItem = (layer: LayerData, depth: number = 0) => {
      const isGroup = layer.type === 'group';
      const isExpanded = expandedGroups.has(layer.id);
      const children = layers.filter(l => l.parentId === layer.id).reverse();
      const isHovered = hoveredLayerId === layer.id;
      const isSelected = selectedLayerId === layer.id;
      const hasThumbnail = layer.thumbnail || (layer.src && (layer.type === 'image' || layer.type === 'video'));

      return (
          <React.Fragment key={layer.id}>
            <div
                onClick={() => onSelectLayer(layer.id)}
                onDoubleClick={(e) => { e.stopPropagation(); onLayerDoubleClick(layer.id); }}
                onMouseEnter={() => setHoveredLayerId(layer.id)}
                onMouseLeave={() => setHoveredLayerId(null)}
                className={`
                    relative flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all duration-200 group/item select-none
                    ${isSelected
                      ? 'bg-primary/15 ring-1 ring-primary/40'
                      : 'hover:bg-white/5'}
                `}
                style={{ marginLeft: `${depth * 14}px` }}
            >
                {isGroup && (
                    <button onClick={(e) => toggleGroup(layer.id, e)} className="p-1 hover:bg-white/5 rounded-md text-stone-500 hover:text-stone-300 transition-all active:scale-[0.95]">
                        {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                    </button>
                )}
                {!isGroup && depth > 0 && <CornerDownRight size={10} className="text-stone-700 shrink-0" />}

                {/* Thumbnail or Icon */}
                <div className={`
                    shrink-0 rounded-md overflow-hidden border transition-all duration-200
                    ${hasThumbnail ? 'w-9 h-9' : 'w-7 h-7'}
                    ${isSelected ? 'border-primary/30 bg-primary/10' : 'border-white/[0.06] bg-[#0d0c0a]'}
                `}>
                    {layer.isLoading ? (
                        <div className="w-full h-full flex items-center justify-center">
                            <Loader2 size={12} className="text-primary animate-spin" />
                        </div>
                    ) : layer.error ? (
                        <div className="w-full h-full flex items-center justify-center">
                            <AlertCircle size={12} className="text-red-500" />
                        </div>
                    ) : hasThumbnail ? (
                        <img
                            src={layer.thumbnail || layer.src}
                            alt=""
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            {renderLayerIcon(layer.type)}
                        </div>
                    )}
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                    <span className={`
                        text-[13px] truncate block transition-colors
                        ${isSelected ? 'text-white font-medium' : 'text-stone-400 group-hover/item:text-stone-300'}
                    `}>
                        {layer.title || "Untitled"}
                    </span>
                    {layer.type !== 'group' && (
                        <span className="text-[10px] text-stone-600 uppercase tracking-wide">{layer.type}</span>
                    )}
                </div>

                {/* Hover Actions */}
                {(isHovered || isSelected) && !layer.isLoading && (
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {canDownload(layer) && onExportLayer && (
                            <div className="relative" ref={exportMenuLayerId === layer.id ? exportMenuRef : undefined}>
                                <button
                                    onClick={() => setExportMenuLayerId(exportMenuLayerId === layer.id ? null : layer.id)}
                                    className="p-1.5 rounded-md text-stone-500 hover:text-primary hover:bg-primary/10 transition-all active:scale-[0.95] flex items-center gap-0.5"
                                    title="Export"
                                >
                                    <Download size={13} />
                                    <ChevronDown size={10} />
                                </button>
                                {exportMenuLayerId === layer.id && (
                                    <div className="absolute right-0 top-full mt-1 bg-elevated border border-border rounded-xl shadow-2xl shadow-black/50 z-50 py-1.5 min-w-[80px]">
                                        {getExportFormats(layer).map(fmt => (
                                            <button
                                                key={fmt}
                                                onClick={() => { onExportLayer(layer.id, fmt); setExportMenuLayerId(null); }}
                                                className="w-full px-3 py-2 text-left text-xs text-stone-300 hover:bg-white/5 hover:text-white transition-colors uppercase"
                                            >
                                                {fmt}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {onDeleteLayer && (
                            <button
                                onClick={() => onDeleteLayer(layer.id)}
                                className="p-1.5 rounded-md text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-[0.95]"
                                title="Delete"
                            >
                                <Trash2 size={13} />
                            </button>
                        )}
                    </div>
                )}
            </div>
            {isGroup && isExpanded && (
                <div className="mt-1 space-y-0.5 ml-4 pl-2 border-l border-white/[0.04]">
                    {children.length > 0 ? (
                        children.map(child => renderLayerItem(child, depth + 1))
                    ) : (
                        <div className="text-[10px] text-stone-600 pl-3 py-2 italic">Empty Group</div>
                    )}
                </div>
            )}
          </React.Fragment>
      );
  };

  // Get root layers (those without parentId), reversed for "Top layer first" display order
  const rootLayers = layers.filter(l => !l.parentId).slice().reverse();

  return (
    <>
      {!isOpen && (
        <button onClick={onToggle} className="absolute top-1/2 left-0 -translate-y-1/2 z-40 bg-surface border-r border-y border-border p-2 rounded-r-lg text-gray-400 hover:text-white shadow-lg"><ChevronRight size={20} /></button>
      )}

      <div className={`absolute top-0 left-0 h-full bg-surface/95 backdrop-blur-xl border-r border-border transition-all duration-300 z-50 flex flex-col shadow-2xl ${isOpen ? 'w-80 translate-x-0' : 'w-80 -translate-x-full'}`}>
        <div className="flex items-center justify-between p-2 border-b border-border">
          <div className="flex gap-1 p-1 bg-black/20 rounded-lg flex-1">
             <button onClick={() => setActiveTab('layers')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'layers' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}><Layers size={14} /> Layers</button>
             <button onClick={() => setActiveTab('properties')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'properties' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}><Info size={14} /> Properties</button>
          </div>
          <button onClick={onToggle} className="p-2 text-gray-400 hover:text-white"><ChevronLeft size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
            {activeTab === 'layers' && (
                <div className="space-y-0.5">
                    {layers.length === 0 ? (
                        <div className="text-center text-gray-500 py-10 text-xs">No layers yet.</div>
                    ) : (
                        rootLayers.map(layer => renderLayerItem(layer))
                    )}
                </div>
            )}

            {activeTab === 'properties' && (
                <div className="space-y-5">
                    {selectedLayer ? (
                        <>
                            {/* Layer Preview & Name */}
                            <div className="space-y-3">
                                {/* Large Preview */}
                                {(selectedLayer.thumbnail || selectedLayer.src) && (selectedLayer.type === 'image' || selectedLayer.type === 'video') && (
                                    <div className="aspect-video w-full rounded-xl overflow-hidden bg-[#0d0c0a] border border-white/[0.06]">
                                        <img
                                            src={selectedLayer.thumbnail || selectedLayer.src}
                                            alt=""
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                )}

                                {/* Name Input */}
                                <div className="relative group">
                                    <input
                                        type="text"
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        onBlur={handleNameBlur}
                                        onKeyDown={handleNameKeyDown}
                                        disabled={!!layerLoading(selectedLayer)}
                                        className="w-full bg-[#0d0c0a] px-3 py-2.5 rounded-lg border border-white/[0.06] text-sm text-white font-medium focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
                                    />
                                    {!layerLoading(selectedLayer) && (
                                        <Edit2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-600 pointer-events-none group-hover:text-stone-400 transition-colors" />
                                    )}
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="space-y-2">
                                {/* Export Options */}
                                {canDownload(selectedLayer) && onExportLayer && (
                                    <div className="space-y-1.5">
                                        <div className="text-[10px] text-stone-600 uppercase tracking-wide">Export as</div>
                                        <div className="flex gap-1.5">
                                            {getExportFormats(selectedLayer).map(fmt => (
                                                <button
                                                    key={fmt}
                                                    onClick={() => onExportLayer(selectedLayer.id, fmt)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 active:scale-[0.97] text-primary text-xs font-medium transition-all uppercase"
                                                >
                                                    <Download size={12} />
                                                    {fmt}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Other Actions */}
                                <div className="flex gap-2">
                                    {canDuplicate(selectedLayer) && onDuplicateLayer && (
                                        <button
                                            onClick={() => onDuplicateLayer(selectedLayer.id)}
                                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-[0.97] text-stone-300 text-xs font-medium transition-all"
                                        >
                                            <Copy size={14} />
                                            Duplicate
                                        </button>
                                    )}
                                    {onDeleteLayer && (
                                        <button
                                            onClick={() => onDeleteLayer(selectedLayer.id)}
                                            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 active:scale-[0.97] text-red-400 text-xs font-medium transition-all"
                                        >
                                            <Trash2 size={14} />
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="space-y-2.5">
                                <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Details</div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-[#0d0c0a] p-2.5 rounded-lg border border-white/[0.04]">
                                        <div className="text-[10px] text-stone-600 mb-0.5">Type</div>
                                        <div className="text-xs text-stone-200 font-medium capitalize">{selectedLayer.type}</div>
                                    </div>
                                    <div className="bg-[#0d0c0a] p-2.5 rounded-lg border border-white/[0.04]">
                                        <div className="text-[10px] text-stone-600 mb-0.5">Width</div>
                                        <div className="text-xs text-stone-200 font-mono">{Math.round(selectedLayer.width)}</div>
                                    </div>
                                    <div className="bg-[#0d0c0a] p-2.5 rounded-lg border border-white/[0.04]">
                                        <div className="text-[10px] text-stone-600 mb-0.5">Height</div>
                                        <div className="text-xs text-stone-200 font-mono">{Math.round(selectedLayer.height)}</div>
                                    </div>
                                    {selectedLayer.type === 'video' && (
                                        <div className="bg-[#0d0c0a] p-2.5 rounded-lg border border-white/[0.04] col-span-3">
                                            <div className="text-[10px] text-stone-600 mb-0.5">Duration</div>
                                            <div className="text-xs text-stone-200 font-mono">{formatDuration(selectedLayer.duration)}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Content for sticky/text */}
                            {(selectedLayer.type === 'sticky' || selectedLayer.type === 'text') && (
                                <div className="space-y-2.5">
                                    <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Content</div>
                                    <div className="bg-[#0d0c0a] p-3 rounded-lg border border-white/[0.04] text-xs text-stone-300 max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                        {selectedLayer.text || <span className="text-stone-600 italic">Empty</span>}
                                    </div>
                                </div>
                            )}

                            {/* Generation Metadata */}
                            {selectedLayer.generationMetadata && (
                                <div className="space-y-2.5">
                                    <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <Cpu size={11} className="text-primary" />
                                        Generation
                                    </div>
                                    <div className="space-y-2">
                                        {selectedLayer.generationMetadata.model && (
                                            <div className="bg-[#0d0c0a] p-2.5 rounded-lg border border-white/[0.04]">
                                                <div className="text-[10px] text-stone-600 mb-0.5">Model</div>
                                                <div className="text-xs text-stone-200 truncate" title={selectedLayer.generationMetadata.model}>
                                                    {selectedLayer.generationMetadata.model}
                                                </div>
                                            </div>
                                        )}
                                        {selectedLayer.generationMetadata.voice && (
                                            <div className="bg-[#0d0c0a] p-2.5 rounded-lg border border-white/[0.04]">
                                                <div className="text-[10px] text-stone-600 mb-0.5 flex items-center gap-1">
                                                    <Mic size={10} /> Voice
                                                </div>
                                                <div className="text-xs text-stone-200 truncate">
                                                    {selectedLayer.generationMetadata.voice}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Prompt */}
                            {selectedLayer.promptUsed && (
                                <div className="space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Prompt</div>
                                        <button
                                            onClick={() => handleCopyPrompt(selectedLayer.promptUsed!)}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                                                promptCopied
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-stone-400 hover:text-stone-200'
                                            }`}
                                        >
                                            {promptCopied ? <Check size={10} /> : <Copy size={10} />}
                                            {promptCopied ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <div className="bg-gradient-to-br from-primary/5 to-transparent p-3 rounded-lg border border-primary/10 text-xs text-stone-300 leading-relaxed">
                                        <span className="text-primary/60">"</span>
                                        {selectedLayer.promptUsed}
                                        <span className="text-primary/60">"</span>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
                                <Info size={24} className="text-stone-600" />
                            </div>
                            <p className="text-sm text-stone-500">Select a layer to view properties</p>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </>
  );
};
const layerLoading = (layer: LayerData) => layer.isLoading || false;
export default Sidebar;
