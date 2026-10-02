import React, { useState } from 'react';
import { IncidentReport, ServerIncidentRevision } from '../types';

interface ConflictDialogProps {
  isOpen: boolean;
  incident: IncidentReport;
  serverVersion: ServerIncidentRevision;
  onClose: () => void;
  onResolve: (choice: 'keep_local' | 'accept_server' | 'merge', mergedText?: string) => Promise<void>;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  isOpen,
  incident,
  serverVersion,
  onClose,
  onResolve
}) => {
  const [selectedChoice, setSelectedChoice] = useState<'keep_local' | 'accept_server' | 'merge'>('merge');
  const [mergedDescription, setMergedDescription] = useState(
    `[Field Unit Note]: ${incident.description}\n\n[HQ Revision Note (${serverVersion.updated_by})]: ${serverVersion.description}`
  );
  const [isResolving, setIsResolving] = useState(false);

  if (!isOpen) return null;

  const handleResolveClick = async () => {
    setIsResolving(true);
    try {
      await onResolve(selectedChoice, selectedChoice === 'merge' ? mergedDescription : undefined);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface border border-error/50 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-error/15 border-b border-error/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-error/20 border border-error text-error flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">sync_problem</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-error/20 text-error px-2 py-0.5 rounded border border-error/30">
                  HTTP 409 CONFLICT
                </span>
                <span className="text-xs font-bold text-on-surface">Report: {incident.id}</span>
              </div>
              <h3 className="text-base font-bold text-on-surface mt-0.5">
                Version Collision Detected
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Comparison Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Headquarters received a concurrent modification for this sector. The server revision (v{serverVersion.revision}) is newer than your offline baseline (v{incident.revision}). Review the differences below and select your resolution strategy.
          </p>

          {/* Side-by-Side Diff Table */}
          <div className="grid grid-cols-2 gap-3 bg-surface-container rounded-xl p-3.5 border border-outline-variant/30 text-xs">
            
            {/* Local Version (Client) */}
            <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-surface-container-high border border-outline-variant/40">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-1.5">
                <span className="font-bold text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">phone_iphone</span>
                  Local Device (v{incident.revision})
                </span>
                <span className="text-[10px] text-on-surface-variant">Your Draft</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Title</span>
                <span className="font-semibold text-on-surface">{incident.title}</span>
              </div>

              <div className="flex items-center gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Severity</span>
                  <span className="uppercase font-bold text-tertiary">{incident.severity}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Photos</span>
                  <span className="font-mono text-on-surface">{incident.photos.length} attached</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Description</span>
                <p className="text-on-surface-variant bg-surface/60 p-2 rounded border border-outline-variant/20 text-[11px] leading-relaxed max-h-24 overflow-y-auto">
                  {incident.description}
                </p>
              </div>
            </div>

            {/* Server Version (Remote HQ) */}
            <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-surface-container-high border border-error/30">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-1.5">
                <span className="font-bold text-error flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">cloud</span>
                  HQ Server (v{serverVersion.revision})
                </span>
                <span className="text-[10px] text-error font-mono font-bold">Remote Live</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Title</span>
                <span className="font-semibold text-on-surface">{serverVersion.title}</span>
              </div>

              <div className="flex items-center gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Severity</span>
                  <span className="uppercase font-bold text-error">{serverVersion.severity}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Photos</span>
                  <span className="font-mono text-on-surface">{serverVersion.photos_count} attached</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-on-surface-variant block">
                  Description ({serverVersion.updated_by})
                </span>
                <p className="text-on-surface-variant bg-surface/60 p-2 rounded border border-outline-variant/20 text-[11px] leading-relaxed max-h-24 overflow-y-auto">
                  {serverVersion.description}
                </p>
              </div>
            </div>

          </div>

          {/* Resolution Options */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
              Select Resolution Protocol:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedChoice('merge')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                  selectedChoice === 'merge'
                    ? 'bg-primary/20 border-primary text-primary font-bold shadow-md ring-1 ring-primary'
                    : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">call_merge</span>
                  <span className="text-xs">Merge Fields</span>
                </div>
                <span className="text-[10px] font-normal text-on-surface-variant">
                  Combine both notes into a unified tactical report.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedChoice('keep_local')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                  selectedChoice === 'keep_local'
                    ? 'bg-tertiary/20 border-tertiary text-tertiary font-bold shadow-md ring-1 ring-tertiary'
                    : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">upload</span>
                  <span className="text-xs">Keep Local</span>
                </div>
                <span className="text-[10px] font-normal text-on-surface-variant">
                  Adopt revision v{serverVersion.revision} and force-upload local draft.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedChoice('accept_server')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                  selectedChoice === 'accept_server'
                    ? 'bg-secondary/20 border-secondary text-secondary font-bold shadow-md ring-1 ring-secondary'
                    : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  <span className="text-xs">Accept Server</span>
                </div>
                <span className="text-[10px] font-normal text-on-surface-variant">
                  Discard local offline draft and adopt HQ version.
                </span>
              </button>
            </div>
          </div>

          {/* Merge Text Editor */}
          {selectedChoice === 'merge' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Merged Description Preview (Editable):
              </label>
              <textarea
                value={mergedDescription}
                onChange={(e) => setMergedDescription(e.target.value)}
                rows={3}
                className="w-full bg-surface-container-high border border-outline-variant/40 rounded-xl p-3 text-xs text-on-surface focus:outline-none focus:border-primary resize-none font-mono"
              />
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-surface-container border-t border-outline-variant/20 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            Cancel
          </button>
          
          <button
            type="button"
            onClick={handleResolveClick}
            disabled={isResolving}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-on-primary shadow-lg flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isResolving ? 'hourglass_top' : 'check'}
            </span>
            {isResolving ? 'Resolving Conflict...' : 'Apply & Continue Sync'}
          </button>
        </div>

      </div>
    </div>
  );
};
