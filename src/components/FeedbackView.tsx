import React, { useState, useEffect } from 'react';
import { useFlightStore, safeInvoke } from '../store/flightStore';
import { 
  LifeBuoy, 
  Send, 
  Copy, 
  Check, 
  Download, 
  Shield, 
  ShieldAlert, 
  FileText, 
  FileWarning, 
  Plane, 
  Route, 
  ExternalLink,
  Eye,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { Select } from './ui/Select';
import packageJson from '../../package.json';

interface LogFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedIso: string;
  isCrash: boolean;
}

export const FeedbackView: React.FC = () => {
  const { flights, savedRoutes } = useFlightStore();

  // Form State
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('apollo_feedback_name') || '';
  });
  const [userEmail, setUserEmail] = useState(() => {
    return localStorage.getItem('apollo_feedback_email') || '';
  });
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'general'>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [includeSystemInfo, setIncludeSystemInfo] = useState(true);

  // Attachments State
  const [logFiles, setLogFiles] = useState<LogFileInfo[]>([]);
  const [selectedLogFileName, setSelectedLogFileName] = useState<string>('');
  const [selectedLogContent, setSelectedLogContent] = useState<string>('');
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const [showLogPreview, setShowLogPreview] = useState(false);

  const [selectedFlightId, setSelectedFlightId] = useState<string>('');
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');

  // UI state
  const [copied, setCopied] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Load saved contact info from SQLite user_settings
  useEffect(() => {
    const loadContactFromDb = async () => {
      try {
        const dbName = await safeInvoke<string | null>('get_user_setting', { key: 'feedbackName' });
        const dbEmail = await safeInvoke<string | null>('get_user_setting', { key: 'feedbackEmail' });
        if (dbName && typeof dbName === 'string') setUserName(dbName);
        if (dbEmail && typeof dbEmail === 'string') setUserEmail(dbEmail);
      } catch {}
    };
    loadContactFromDb();
  }, []);

  // Save contact info locally to localStorage and SQLite logbook.db
  useEffect(() => {
    localStorage.setItem('apollo_feedback_name', userName);
    safeInvoke('set_user_setting', { key: 'feedbackName', value: userName });
  }, [userName]);

  useEffect(() => {
    localStorage.setItem('apollo_feedback_email', userEmail);
    safeInvoke('set_user_setting', { key: 'feedbackEmail', value: userEmail });
  }, [userEmail]);

  // Load available log files from app_log_dir
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const files = await safeInvoke<LogFileInfo[]>('list_log_files');
        if (files && Array.isArray(files)) {
          setLogFiles(files);
          // If there is a crash log, select the most recent one by default
          const crash = files.find(f => f.isCrash);
          if (crash) {
            setSelectedLogFileName(crash.name);
          } else if (files.length > 0) {
            setSelectedLogFileName(files[0].name);
          }
        }
      } catch (err) {
        console.error('Failed to query log files', err);
      }
    };
    loadLogs();
  }, []);

  // Fetch log content when selection changes
  useEffect(() => {
    if (!selectedLogFileName) {
      setSelectedLogContent('');
      return;
    }

    const fetchContent = async () => {
      setIsLoadingLog(true);
      try {
        const content = await safeInvoke<string>('get_log_file_content', {
          fileName: selectedLogFileName,
        });
        setSelectedLogContent(content || '');
      } catch (err) {
        console.error('Failed to read log content', err);
        setSelectedLogContent('[Error loading log file content]');
      } finally {
        setIsLoadingLog(false);
      }
    };
    fetchContent();
  }, [selectedLogFileName]);

  const selectedFlight = flights.find(f => f.id === selectedFlightId);
  const selectedRoute = savedRoutes.find(r => r.id === selectedRouteId);

  // Generate standardized markdown report
  const generateMarkdownReport = (isForUrl = false): string => {
    const sections: string[] = [];

    // Header & User contact
    sections.push(`### Feedback & Bug Report: ${title.trim() || 'Untitled Report'}`);
    sections.push(`**Type:** ${feedbackType.toUpperCase()}`);
    if (userName || userEmail) {
      sections.push(`**Contact:** ${userName || 'Anonymous'} ${userEmail ? `<${userEmail}>` : ''}`);
    }

    // Description
    sections.push(`\n#### Description\n${description.trim() || 'No description provided.'}`);

    // System Environment (if privacy switch enabled)
    if (includeSystemInfo) {
      sections.push(`\n#### Environment & System Diagnostics`);
      sections.push(`- **App Version:** v${packageJson.version}`);
      sections.push(`- **Platform:** ${navigator.platform || 'Unknown OS'}`);
      sections.push(`- **User Agent:** \`${navigator.userAgent}\``);
      sections.push(`- **Screen Resolution:** ${window.screen.width}x${window.screen.height}`);
      sections.push(`- **Timestamp:** ${new Date().toISOString()}`);
    } else {
      sections.push(`\n#### Environment\n*(System information omitted by user preference)*`);
    }

    // Attached Recorded Flight
    if (selectedFlight) {
      sections.push(`\n#### Attached Recorded Flight`);
      sections.push(`- **Flight ID:** \`${selectedFlight.id}\``);
      sections.push(`- **Route:** ${selectedFlight.departureIcao} ➔ ${selectedFlight.arrivalIcao}`);
      sections.push(`- **Aircraft:** ${selectedFlight.aircraftType}`);
      sections.push(`- **Duration:** ${Math.round(selectedFlight.flightTimeSeconds / 60)} minutes`);
      sections.push(`- **Distance Flown:** ${selectedFlight.distanceFlownNm.toFixed(1)} NM`);
      sections.push(`- **Max Altitude:** ${selectedFlight.maxAltitude.toLocaleString()} ft MSL`);
      sections.push(`- **Max Ground Speed:** ${selectedFlight.maxGroundSpeed} kt`);
      if (selectedFlight.touchdowns && selectedFlight.touchdowns.length > 0) {
        const primary = selectedFlight.touchdowns[0];
        const gForceStr = typeof primary.gForce === 'number' ? ` (G-Force: ${primary.gForce.toFixed(2)}G)` : '';
        sections.push(`- **Landing Rate:** ${primary.verticalSpeedFpm} fpm${gForceStr}`);
      }
    }

    // Attached Saved Route
    if (selectedRoute) {
      sections.push(`\n#### Attached Saved Route`);
      sections.push(`- **Route ID:** \`${selectedRoute.id}\``);
      sections.push(`- **Name:** ${selectedRoute.name}`);
      sections.push(`- **Route:** ${selectedRoute.departureIcao} ➔ ${selectedRoute.arrivalIcao}`);
      sections.push(`- **Total Distance:** ${selectedRoute.totalDistanceNm.toFixed(1)} NM`);
      sections.push(`- **Aircraft Category:** ${selectedRoute.aircraftCategory}`);
    }

    // Attached Log / Crash Report
    if (selectedLogFileName && selectedLogContent) {
      sections.push(`\n#### Attached Log: \`${selectedLogFileName}\``);
      // For browser URL, truncate if needed to prevent URL overflow
      const maxChars = isForUrl ? 1500 : 20000;
      let logSnippet = selectedLogContent;
      if (logSnippet.length > maxChars) {
        logSnippet = `... [clipped, showing latest ${maxChars} characters]\n` + logSnippet.slice(-maxChars);
      }
      sections.push(`\`\`\`text\n${logSnippet}\n\`\`\``);
    }

    return sections.join('\n');
  };

  const handleOpenGitHub = async () => {
    const reportBody = generateMarkdownReport(true);
    const issueTitle = `[${feedbackType.toUpperCase()}] ${title.trim() || 'Bug Report / Feedback'}`;
    const url = `https://github.com/jurgenjacobsen/apollo-flight/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(reportBody)}`;

    // 1. Try our native Tauri command (handles Windows/macOS/Linux external browser launch)
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_external_url', { url });
      return;
    } catch (e) {
      console.warn('Backend open_external_url failed, trying plugin-shell', e);
    }

    // 2. Try Tauri plugin-shell open
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
      return;
    } catch (e) {
      console.warn('plugin-shell open failed, trying window.open', e);
    }

    // 3. Fallback for browser dev mode
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyMarkdown = async () => {
    const fullReport = generateMarkdownReport(false);
    try {
      await navigator.clipboard.writeText(fullReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleExportMarkdown = async () => {
    const fullReport = generateMarkdownReport(false);
    const filename = `apollo-flight-report-${Date.now()}.md`;

    // 1. Native File System Access API (Opens Windows Explorer "Save As" location dialog)
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'Markdown Report (*.md)',
              accept: {
                'text/markdown': ['.md'],
              },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(fullReport);
        await writable.close();
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 2500);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // User deliberately cancelled / closed the Windows Explorer file picker
          return;
        }
        console.warn('[FeedbackView] showSaveFilePicker failed, trying native backend dialog:', err);
      }
    }

    // 2. Native Tauri backend command fallback (calls native Windows Explorer SaveFileDialog)
    try {
      const savedPath = await safeInvoke<string | null>('save_file_dialog', {
        defaultFilename: filename,
        content: fullReport,
        filterName: 'Markdown Report',
        filterExt: 'md',
      });
      if (savedPath) {
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 2500);
        return;
      } else if (savedPath === null) {
        // User cancelled in Explorer dialog
        return;
      }
    } catch (err) {
      console.warn('[FeedbackView] save_file_dialog failed, trying browser download fallback:', err);
    }

    // 3. Direct browser blob download fallback
    const blob = new Blob([fullReport], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-neutral-200 dark:border-geist-hairline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
              <LifeBuoy className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                Feedback & Bug Reports
              </h1>
              <p className="text-xs text-neutral-500 dark:text-geist-muted">
                Submit issue reports, telemetry diagnostics, and suggestions directly to the project
              </p>
            </div>
          </div>
        </div>

        {/* Main Form Card */}
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
          {/* Feedback Type & Title */}
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Report Type
              </label>
              <div className="flex items-center gap-2">
                {(['bug', 'feature', 'general'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFeedbackType(type)}
                    className={`px-3 py-1 rounded-sm text-xs font-medium capitalize transition-colors ${
                      feedbackType === type
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                        : 'bg-neutral-100 dark:bg-geist-card text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'bug' ? 'Bug Report' : type === 'feature' ? 'Feature Request' : 'General Feedback'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Title / Short Summary <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Telemetry trajectory gap during high bank turn at LOWI"
                className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-black/50 border border-neutral-200 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Detailed Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe what occurred, steps to reproduce, simulator aircraft used, and any unexpected behavior observed..."
                className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-black/50 border border-neutral-200 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 resize-y"
              />
            </div>
          </div>

          {/* Contact Information */}
          <div className="p-5 space-y-3">
            <h3 className="text-xs font-semibold text-neutral-900 dark:text-white uppercase tracking-wider">
              Contact Information (Optional)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 dark:text-geist-muted">Your Name or Pilot Call-Sign</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Captain Miller"
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-black/50 border border-neutral-200 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 dark:text-geist-muted">Email (for follow-up)</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="pilot@example.com"
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-black/50 border border-neutral-200 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
            </div>
          </div>

          {/* Attachments Section */}
          <div className="p-5 space-y-4">
            <h3 className="text-xs font-semibold text-neutral-900 dark:text-white uppercase tracking-wider">
              Diagnostic Attachments
            </h3>

            {/* Log File Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Attach Crash Dump or Application Log</span>
                </label>
                {selectedLogFileName && (
                  <button
                    type="button"
                    onClick={() => setShowLogPreview(!showLogPreview)}
                    className="text-[11px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{showLogPreview ? 'Hide Preview' : 'Preview Content'}</span>
                  </button>
                )}
              </div>

              <Select
                value={selectedLogFileName}
                onChange={(val) => setSelectedLogFileName(val)}
                placeholder="-- No log attached --"
                options={[
                  { value: '', label: '-- No log attached --' },
                  ...logFiles.map((f) => ({
                    value: f.name,
                    label: `${f.isCrash ? '[Crash Dump] ' : '[Session Log] '}${f.name} (${(f.sizeBytes / 1024).toFixed(1)} KB)`,
                  })),
                ]}
                className="w-full"
                triggerClassName="bg-neutral-50 dark:bg-black/50"
                size="md"
              />

              {showLogPreview && selectedLogContent && (
                <div className="mt-2 p-3 bg-neutral-100 dark:bg-black/70 border border-neutral-200 dark:border-geist-hairline rounded-sm max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                  {isLoadingLog ? 'Loading log preview...' : selectedLogContent}
                </div>
              )}
            </div>

            {/* Logbook Flight Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-neutral-500" />
                <span>Attach Recorded Flight from Logbook</span>
              </label>
              <Select
                value={selectedFlightId}
                onChange={(val) => setSelectedFlightId(val)}
                placeholder="-- No flight attached --"
                options={[
                  { value: '', label: '-- No flight attached --' },
                  ...flights.map((f) => ({
                    value: f.id,
                    label: `${f.departureIcao} ➔ ${f.arrivalIcao} | ${f.aircraftType} (${f.startTime.slice(0, 10)}) - ${f.distanceFlownNm.toFixed(0)} NM`,
                  })),
                ]}
                className="w-full"
                triggerClassName="bg-neutral-50 dark:bg-black/50"
                size="md"
              />
            </div>

            {/* Saved Route Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5 text-neutral-500" />
                <span>Attach Saved Route Plan</span>
              </label>
              <Select
                value={selectedRouteId}
                onChange={(val) => setSelectedRouteId(val)}
                placeholder="-- No route attached --"
                options={[
                  { value: '', label: '-- No route attached --' },
                  ...savedRoutes.map((r) => ({
                    value: r.id,
                    label: `${r.name} (${r.departureIcao} ➔ ${r.arrivalIcao}) - ${r.totalDistanceNm.toFixed(0)} NM`,
                  })),
                ]}
                className="w-full"
                triggerClassName="bg-neutral-50 dark:bg-black/50"
                size="md"
              />
            </div>
          </div>

          {/* Privacy Switch */}
          <div className="p-5 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-neutral-900 dark:text-white">
                  Share System & App Environment Diagnostics
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-geist-muted">
                Includes Apollo Flight version (v{packageJson.version}), operating system, user agent, and screen resolution to assist debugging.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIncludeSystemInfo(!includeSystemInfo)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                includeSystemInfo ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  includeSystemInfo ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Submission Bar */}
          <div className="p-5 bg-neutral-50 dark:bg-black/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyMarkdown}
                className="flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-geist-card dark:hover:bg-[#222222] text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-geist-hairline transition-colors cursor-pointer"
                title="Copy markdown report to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-geist-card dark:hover:bg-[#222222] text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-geist-hairline transition-colors cursor-pointer"
                title="Download full report as markdown file"
              >
                {exportSuccess ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Download className="w-3.5 h-3.5" />}
                <span>{exportSuccess ? 'Exported' : 'Export .md'}</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenGitHub}
                disabled={!title.trim() || !description.trim()}
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-sm text-xs font-medium bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit via GitHub Issues</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
