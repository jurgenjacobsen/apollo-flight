import React, { useState, useRef } from 'react';
import { useFlightStore } from '../store/flightStore';
import { ApolloExportBundle } from '../types/flight';
import {
  Upload,
  FileCheck,
  AlertCircle,
  Check,
  CheckCircle2,
  X,
  FileText,
  Sliders,
  Database,
  ArrowRight,
  ShieldAlert,
  Layers,
  Sparkles,
} from 'lucide-react';

export interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBundle?: ApolloExportBundle | null;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  initialBundle,
}) => {
  const { flights, savedRoutes, importDataBundle, theme, closeToTray, autoStartRecording, pageSize } = useFlightStore();

  const [bundle, setBundle] = useState<ApolloExportBundle | null>(initialBundle || null);
  const [strategy, setStrategy] = useState<'skip' | 'overwrite' | 'keep_both'>('skip');
  const [settingsChoices, setSettingsChoices] = useState<Record<string, 'current' | 'imported'>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (initialBundle) {
      setBundle(initialBundle);
      analyzeConflicts(initialBundle);
    } else {
      setBundle(null);
      setSettingsChoices({});
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [initialBundle, isOpen]);

  const analyzeConflicts = (parsed: ApolloExportBundle) => {
    setErrorMessage(null);
    const initialChoices: Record<string, 'current' | 'imported'> = {};

    if (parsed.userSettings) {
      const currentMap: Record<string, string> = {
        theme,
        closeToTray: String(closeToTray),
        autoStartRecording: String(autoStartRecording),
        pageSize: String(pageSize),
      };

      for (const [key, val] of Object.entries(parsed.userSettings)) {
        if (currentMap[key] !== undefined && currentMap[key] !== String(val)) {
          // Default to keeping current setting unless user switches
          initialChoices[key] = 'current';
        } else {
          initialChoices[key] = 'imported';
        }
      }
    }
    setSettingsChoices(initialChoices);
  };

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text) as ApolloExportBundle;

        if (!parsed || parsed.format !== 'apollo-flight-bundle') {
          throw new Error("Invalid file format. Expected an 'apollo-flight-bundle' JSON file.");
        }

        setBundle(parsed);
        analyzeConflicts(parsed);
      } catch (err: any) {
        console.error('[ImportModal] File parsing error:', err);
        setErrorMessage(err?.message || 'Failed to read or parse the selected file.');
        setBundle(null);
      }
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read file from disk.');
    };
    reader.readAsText(file);
  };

  // Conflict counts
  const conflictingFlightsCount = React.useMemo(() => {
    if (!bundle?.flights) return 0;
    const currentIds = new Set(flights.map((f) => f.id));
    return bundle.flights.filter((f) => currentIds.has(f.id)).length;
  }, [bundle, flights]);

  const conflictingRoutesCount = React.useMemo(() => {
    if (!bundle?.savedRoutes) return 0;
    const currentIds = new Set(savedRoutes.map((r) => r.id));
    return bundle.savedRoutes.filter((r) => currentIds.has(r.id)).length;
  }, [bundle, savedRoutes]);

  const settingsConflictKeys = React.useMemo(() => {
    if (!bundle?.userSettings) return [];
    const currentMap: Record<string, string> = {
      theme,
      closeToTray: String(closeToTray),
      autoStartRecording: String(autoStartRecording),
      pageSize: String(pageSize),
    };
    return Object.keys(bundle.userSettings).filter(
      (k) => currentMap[k] !== undefined && currentMap[k] !== String(bundle.userSettings![k])
    );
  }, [bundle, theme, closeToTray, autoStartRecording, pageSize]);

  const handleExecuteImport = async () => {
    if (!bundle) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const res = await importDataBundle(bundle, strategy, settingsChoices);
      setSuccessMessage(res.message);
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('[ImportModal] Import failed:', err);
      setErrorMessage(err?.message || 'Import failed.');
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-2xl overflow-hidden text-neutral-900 dark:text-neutral-100 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-geist-hairline bg-neutral-50/70 dark:bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-sm bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                Import Apollo Flight Data
              </h2>
              <p className="text-xs text-neutral-500 dark:text-geist-muted">
                Restore full backups, logbooks, route dispatches, or user configuration safely.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-center gap-2.5 p-3 rounded-sm bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="flex items-center gap-2.5 p-3 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Step 1: File Dropzone (if no bundle yet) */}
          {!bundle ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 border-2 border-dashed rounded-sm flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 bg-neutral-50/50 dark:bg-[#161616]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.apollo"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <div className="p-3 rounded-full bg-white dark:bg-[#202020] border border-neutral-200 dark:border-neutral-700 shadow-2xs">
                <FileCheck className="w-6 h-6 text-neutral-500 dark:text-neutral-400" />
              </div>
              <div className="text-center space-y-1">
                <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                  Click to select or drag & drop Apollo Flight backup file
                </div>
                <div className="text-[11px] text-neutral-400">
                  Accepts .json backup files generated by Apollo Flight
                </div>
              </div>
            </div>
          ) : (
            /* Step 2: Bundle Details & Conflict Configuration */
            <div className="space-y-4">
              {/* Package Summary Card */}
              <div className="p-4 rounded-sm bg-neutral-50 dark:bg-[#181818] border border-neutral-200 dark:border-geist-hairline space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-neutral-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                      Package: {bundle.scope.toUpperCase()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBundle(null)}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Choose different file
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                  <div>
                    <div className="text-[10px] text-neutral-400">Exported At</div>
                    <div className="font-mono text-neutral-800 dark:text-neutral-200">
                      {new Date(bundle.exportedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-400">Flights Included</div>
                    <div className="font-bold text-neutral-900 dark:text-white tabular-nums">
                      {bundle.flights?.length || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-400">Routes Included</div>
                    <div className="font-bold text-neutral-900 dark:text-white tabular-nums">
                      {bundle.savedRoutes?.length || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-400">Telemetry Data</div>
                    <div className="font-medium text-neutral-800 dark:text-neutral-200">
                      {bundle.metadata.hasTelemetry === false ? 'Excluded (Summaries)' : 'Included'}
                    </div>
                  </div>
                </div>

                {bundle.metadata.hasTelemetry === false && (
                  <div className="p-2.5 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300">
                    <strong>Note:</strong> This file contains flight summaries without raw telemetry tracks. Great-circle route paths and touchdown metrics will be preserved.
                  </div>
                )}
              </div>

              {/* Conflict Resolution Strategy for Flights & Routes */}
              {(conflictingFlightsCount > 0 || conflictingRoutesCount > 0) && (
                <div className="p-4 rounded-sm bg-amber-50/50 dark:bg-[#1a140a] border border-amber-200 dark:border-amber-900/40 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold">
                      Matching records detected ({conflictingFlightsCount} flights, {conflictingRoutesCount} routes)
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    Some records in this backup already exist in your local database. Choose how to handle duplicates:
                  </p>

                  <div className="space-y-2 pt-1 text-xs">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictStrategy"
                        value="skip"
                        checked={strategy === 'skip'}
                        onChange={() => setStrategy('skip')}
                        className="mt-0.5 text-neutral-900 focus:ring-0"
                      />
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">
                          Skip Duplicates <span className="text-neutral-400 font-normal">(Recommended)</span>
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Existing logbook and route entries remain untouched. Only new items are added.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictStrategy"
                        value="overwrite"
                        checked={strategy === 'overwrite'}
                        onChange={() => setStrategy('overwrite')}
                        className="mt-0.5 text-neutral-900 focus:ring-0"
                      />
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">
                          Overwrite Existing
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Existing items with matching IDs are replaced with the imported data.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictStrategy"
                        value="keep_both"
                        checked={strategy === 'keep_both'}
                        onChange={() => setStrategy('keep_both')}
                        className="mt-0.5 text-neutral-900 focus:ring-0"
                      />
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">
                          Keep Both (Duplicate with new IDs)
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Incoming matching items receive fresh IDs so both entries remain in your logbook.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Property-by-Property Settings Conflict Resolver */}
              {settingsConflictKeys.length > 0 && (
                <div className="p-4 rounded-sm bg-neutral-50 dark:bg-[#181818] border border-neutral-200 dark:border-geist-hairline space-y-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-neutral-500" />
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      Settings Differences ({settingsConflictKeys.length})
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-500">
                    The backup contains differing preference values. Select which value to use for each setting:
                  </p>

                  <div className="border border-neutral-200 dark:border-geist-hairline rounded-sm overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-neutral-100/70 dark:bg-[#202020] text-[10px] uppercase text-neutral-500">
                        <tr>
                          <th className="py-2 px-3">Setting</th>
                          <th className="py-2 px-3">Current</th>
                          <th className="py-2 px-3">Imported</th>
                          <th className="py-2 px-3 text-right">Choice</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 dark:divide-geist-hairline">
                        {settingsConflictKeys.map((key) => {
                          const currentVal =
                            key === 'theme'
                              ? theme
                              : key === 'closeToTray'
                              ? String(closeToTray)
                              : key === 'autoStartRecording'
                              ? String(autoStartRecording)
                              : key === 'pageSize'
                              ? String(pageSize)
                              : 'default';
                          const importedVal = String(bundle.userSettings![key]);
                          const choice = settingsChoices[key] || 'current';

                          return (
                            <tr key={key} className="hover:bg-neutral-50 dark:hover:bg-[#1f1f1f]">
                              <td className="py-2 px-3 font-medium text-neutral-900 dark:text-white capitalize">
                                {key.replace(/([A-Z])/g, ' $1')}
                              </td>
                              <td className="py-2 px-3 font-mono text-neutral-600 dark:text-neutral-400">
                                {currentVal}
                              </td>
                              <td className="py-2 px-3 font-mono text-neutral-600 dark:text-neutral-400">
                                {importedVal}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <div className="inline-flex rounded border border-neutral-300 dark:border-neutral-700 p-0.5 text-[10px]">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSettingsChoices((prev) => ({ ...prev, [key]: 'current' }))
                                    }
                                    className={`px-2 py-0.5 rounded-xs transition-colors ${
                                      choice === 'current'
                                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                                        : 'text-neutral-500'
                                    }`}
                                  >
                                    Keep Current
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSettingsChoices((prev) => ({ ...prev, [key]: 'imported' }))
                                    }
                                    className={`px-2 py-0.5 rounded-xs transition-colors ${
                                      choice === 'imported'
                                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                                        : 'text-neutral-500'
                                    }`}
                                  >
                                    Use Imported
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 dark:border-geist-hairline bg-neutral-50/70 dark:bg-[#161616]">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-medium rounded-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>

          {bundle && (
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-sm bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-black transition-colors shadow-xs disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'Importing Data...' : 'Import Selected Data'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
