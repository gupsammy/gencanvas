
import React, { useState, useEffect } from 'react';
import { LayerData } from '../types';
import { Layers, Info, ChevronRight, ChevronLeft, Image as ImageIcon, Edit2, Video as VideoIcon, Sliders, Cpu, Loader2, AlertCircle, StickyNote, BoxSelect, Pencil, Type as TypeIcon, Folder, FolderOpen, CornerDownRight, Mic } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  layers: LayerData[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onRenameLayer: (id: string, newName: string) => void;
  onLayerDoubleClick: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle, layers, selectedLayerId, onSelectLayer, onRenameLayer, onLayerDoubleClick }) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'properties'>('layers');
  const [editingName, setEditingName] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  const renderLayerIcon = (type: string) => {
      switch(type) {
          case 'image': return <ImageIcon size={14} className="text-blue-400"/>;
          case 'video': return <VideoIcon size={14} className="text-purple-400"/>;
          case 'audio': return <Mic size={14} className="text-green-400"/>;
          case 'sticky': return <StickyNote size={14} className="text-yellow-400"/>;
          case 'group': return <BoxSelect size={14} className="text-gray-400"/>;
          case 'drawing': return <Pencil size={14} className="text-pink-400"/>;
          case 'text': return <TypeIcon size={14} className="text-white"/>;
          default: return <Layers size={14} />;
      }
  };

  const renderLayerItem = (layer: LayerData, depth: number = 0) => {
      const isGroup = layer.type === 'group';
      const isExpanded = expandedGroups.has(layer.id);
      const children = layers.filter(l => l.parentId === layer.id).reverse(); // Reverse for display order to match visual stack usually
      // Actually standard layer list usually shows top layer first. Our array has top layer last. 
      // So reversing the full list for sidebar is standard.

      return (
          <React.Fragment key={layer.id}>
            <div 
                onClick={() => onSelectLayer(layer.id)} 
                onDoubleClick={(e) => { e.stopPropagation(); onLayerDoubleClick(layer.id); }}
                className={`
                    flex items-center gap-2 p-1.5 rounded-md cursor-pointer border-l-2 transition-all group/item select-none
                    ${selectedLayerId === layer.id ? 'bg-white/10 border-primary' : 'hover:bg-white/5 border-transparent'}
                `}
                style={{ marginLeft: `${depth * 12}px` }}
            >
                {isGroup && (
                    <button onClick={(e) => toggleGroup(layer.id, e)} className="p-0.5 hover:bg-white/10 rounded text-gray-400">
                        {isExpanded ? <FolderOpen size={12} /> : <Folder size={12} />}
                    </button>
                )}
                {!isGroup && depth > 0 && <CornerDownRight size={10} className="text-gray-600" />}
                
                <div className="w-5 h-5 rounded bg-[#101012] shrink-0 overflow-hidden border border-white/5 relative flex items-center justify-center">
                    {layer.isLoading ? (<Loader2 size={10} className="text-primary animate-spin" />) : layer.error ? (<AlertCircle size={10} className="text-red-500" />) : (renderLayerIcon(layer.type))}
                </div>
                
                <div className="flex-1 min-w-0 flex items-center justify-between">
                    <span className={`text-xs truncate ${selectedLayerId === layer.id ? 'text-white font-medium' : 'text-gray-400'}`}>{layer.title || "Untitled"}</span>
                </div>
            </div>
            {isGroup && isExpanded && (
                <div className="mt-1 space-y-0.5 border-l border-white/5 ml-3 pl-1">
                    {children.length > 0 ? (
                        children.map(child => renderLayerItem(child, depth + 1))
                    ) : (
                        <div className="text-[9px] text-gray-600 pl-4 py-1 italic">Empty Group</div>
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
        <button onClick={onToggle} className="absolute top-1/2 right-0 -translate-y-1/2 z-40 bg-surface border-l border-y border-border p-2 rounded-l-lg text-gray-400 hover:text-white shadow-lg"><ChevronLeft size={20} /></button>
      )}

      <div className={`absolute top-0 right-0 h-full bg-surface/95 backdrop-blur-xl border-l border-border transition-all duration-300 z-50 flex flex-col shadow-2xl ${isOpen ? 'w-80 translate-x-0' : 'w-80 translate-x-full'}`}>
        <div className="flex items-center justify-between p-2 border-b border-border">
          <div className="flex gap-1 p-1 bg-black/20 rounded-lg flex-1">
             <button onClick={() => setActiveTab('layers')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'layers' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}><Layers size={14} /> Layers</button>
             <button onClick={() => setActiveTab('properties')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'properties' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}><Info size={14} /> Properties</button>
          </div>
          <button onClick={onToggle} className="p-2 text-gray-400 hover:text-white"><ChevronRight size={18} /></button>
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
                <div className="space-y-4">
                    {selectedLayer ? (
                        <>
                            <div className="space-y-2">
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Layer Name</div>
                                <div className="relative group">
                                    <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} onBlur={handleNameBlur} onKeyDown={handleNameKeyDown} disabled={!!layerLoading(selectedLayer)} className="w-full bg-black/20 p-2 rounded border border-white/5 text-sm text-white font-medium focus:border-primary focus:outline-none focus:bg-black/40 transition-colors disabled:opacity-50" />
                                    {!layerLoading(selectedLayer) && <Edit2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none group-hover:text-gray-300" />}
                                </div>
                            </div>
                            <hr className="border-white/10" />
                            <div className="space-y-3">
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Info</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-black/20 p-2 rounded border border-white/5"><div className="text-[10px] text-gray-500">Type</div><div className="text-xs text-gray-200 uppercase">{selectedLayer.type}</div></div>
                                    <div className="bg-black/20 p-2 rounded border border-white/5"><div className="text-[10px] text-gray-500">Width</div><div className="text-xs text-gray-200">{Math.round(selectedLayer.width)} px</div></div>
                                    <div className="bg-black/20 p-2 rounded border border-white/5"><div className="text-[10px] text-gray-500">Height</div><div className="text-xs text-gray-200">{Math.round(selectedLayer.height)} px</div></div>
                                    {selectedLayer.type === 'video' && <div className="bg-black/20 p-2 rounded border border-white/5"><div className="text-[10px] text-gray-500">Duration</div><div className="text-xs text-gray-200">{formatDuration(selectedLayer.duration)}</div></div>}
                                </div>
                            </div>
                            
                            {(selectedLayer.type === 'sticky' || selectedLayer.type === 'text') && (
                                <div className="space-y-2 mt-4">
                                     <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Content</div>
                                     <div className="bg-black/20 p-2 rounded border border-white/5 text-xs text-gray-300 max-h-32 overflow-y-auto whitespace-pre-wrap">{selectedLayer.text || "(Empty)"}</div>
                                </div>
                            )}

                            {selectedLayer.generationMetadata && (
                                <>
                                    <hr className="border-white/10" />
                                    <div className="space-y-3">
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Sliders size={12} /> Generation Settings</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {selectedLayer.generationMetadata.model && <div className="bg-black/20 p-2 rounded border border-white/5 col-span-2"><div className="text-[10px] text-gray-500 flex items-center gap-1"><Cpu size={10}/> Model</div><div className="text-xs text-gray-200 truncate" title={selectedLayer.generationMetadata.model}>{selectedLayer.generationMetadata.model}</div></div>}
                                            {selectedLayer.generationMetadata.voice && <div className="bg-black/20 p-2 rounded border border-white/5 col-span-2"><div className="text-[10px] text-gray-500 flex items-center gap-1"><Mic size={10}/> Voice</div><div className="text-xs text-gray-200 truncate">{selectedLayer.generationMetadata.voice}</div></div>}
                                        </div>
                                    </div>
                                </>
                            )}
                            
                            {selectedLayer.promptUsed && (
                                <div className="space-y-2 mt-4">
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Prompt Used</div>
                                    <div className="bg-black/20 p-3 rounded-lg border border-white/5 text-xs text-gray-300 leading-relaxed italic">"{selectedLayer.promptUsed}"</div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center opacity-40"><Info size={48} className="mb-4" /><p className="text-sm">Select a layer to view details.</p></div>
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
