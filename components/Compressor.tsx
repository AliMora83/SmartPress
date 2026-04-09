
"use client";

import { useState, useRef, useEffect, useCallback, DragEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Upload, FileVideo, Download, Loader2, CheckCircle, Server, Monitor, X, Image as ImageIcon, Settings2, RefreshCw, Clock, Cpu, Package, AlertCircle } from "lucide-react";
import { get, set } from "idb-keyval";

// --- Types ---

type FileStatus = "pending" | "queued" | "processing" | "finalizing" | "done" | "error";

interface FileItem {
    id: string;
    file: File;
    status: FileStatus;
    mode: "client" | "server";
    progress: number;
    preview?: string;
    downloadLink?: string;
    errorMessage?: string;
    originalSize?: number;
    newSize?: number;
    jobId?: string; // Phase 2: backend job ID for async polling
}

// Status label config for each state
const STATUS_CONFIG: Record<FileStatus, { label: string; color: string; icon: typeof Clock }> = {
    pending: { label: "Ready", color: "#6b7280", icon: Clock },
    queued: { label: "Waiting in queue...", color: "#8b5cf6", icon: Clock },
    processing: { label: "Compressing", color: "#3b82f6", icon: Cpu },
    finalizing: { label: "Wrapping up...", color: "#f59e0b", icon: Package },
    done: { label: "Done", color: "#10b981", icon: CheckCircle },
    error: { label: "Failed", color: "#ef4444", icon: AlertCircle },
};

// --- Polling Hook ---

function useJobPoller(
    files: FileItem[],
    setFiles: React.Dispatch<React.SetStateAction<FileItem[]>>,
    apiUrl: string,
) {
    const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

    const startPolling = useCallback((jobId: string, fileId: string) => {
        // Don't start if already polling this job
        if (intervalsRef.current.has(jobId)) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${apiUrl}/status/${jobId}`);
                if (!res.ok) {
                    console.error(`[Poller] Status check failed for ${jobId}: ${res.status}`);
                    return;
                }

                const job = await res.json();

                setFiles(prev => prev.map(f => {
                    if (f.id !== fileId) return f;

                    const updatedFile: FileItem = { ...f };

                    // Map server status to UI status
                    switch (job.status) {
                        case "queued":
                            updatedFile.status = "queued";
                            updatedFile.progress = 0;
                            break;
                        case "processing":
                            updatedFile.status = "processing";
                            updatedFile.progress = job.progress || 0;
                            break;
                        case "finalizing":
                            updatedFile.status = "finalizing";
                            updatedFile.progress = 99;
                            break;
                        case "completed":
                            updatedFile.status = "done";
                            updatedFile.progress = 100;
                            updatedFile.downloadLink = job.download_url;
                            updatedFile.newSize = job.new_size;
                            updatedFile.originalSize = job.original_size;
                            break;
                        case "failed":
                            updatedFile.status = "error";
                            updatedFile.errorMessage = job.error || "Compression failed";
                            break;
                    }

                    return updatedFile;
                }));

                // Stop polling on terminal states
                if (job.status === "completed" || job.status === "failed") {
                    clearInterval(interval);
                    intervalsRef.current.delete(jobId);
                }
            } catch (err) {
                console.error(`[Poller] Network error polling ${jobId}:`, err);
            }
        }, 2000); // Poll every 2 seconds

        intervalsRef.current.set(jobId, interval);
    }, [apiUrl, setFiles]);

    // Cleanup all intervals on unmount
    useEffect(() => {
        return () => {
            intervalsRef.current.forEach(interval => clearInterval(interval));
            intervalsRef.current.clear();
        };
    }, []);

    return { startPolling };
}


// --- Main Component ---

export default function Compressor() {
    const [loaded, setLoaded] = useState(false);
    const [ffmpegRef, setFfmpegRef] = useState<FFmpeg | null>(null);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [dragActive, setDragActive] = useState(false);

    // Quality Settings
    const [videoCrf, setVideoCrf] = useState(28);
    const [imageQuality, setImageQuality] = useState(15);
    const [showSettings, setShowSettings] = useState(false);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    // Initialize job poller
    const { startPolling } = useJobPoller(files, setFiles, API_URL);

    // Load initial state and FFmpeg
    useEffect(() => {
        const load = async () => {
            // Restore settings from IDB
            const savedCrf = await get("smartpress_video_crf");
            const savedImgQ = await get("smartpress_image_quality");
            if (savedCrf) setVideoCrf(savedCrf);
            if (savedImgQ) setImageQuality(savedImgQ);

            // Restore files from IDB (if any)
            const savedFiles = await get("smartpress_files");
            if (savedFiles && Array.isArray(savedFiles)) {
                // Re-generate object URLs for previews as they don't persist
                const restoredFiles = await Promise.all(savedFiles.map(async (f: FileItem) => {
                    const preview = await generatePreview(f.file);
                    // Reset in-progress states to pending (they won't be recoverable)
                    const status: FileStatus = (f.status === "queued" || f.status === "processing" || f.status === "finalizing")
                        ? "pending" : f.status;
                    return { ...f, preview, status };
                }));
                setFiles(restoredFiles);
            }

            const ffmpeg = new FFmpeg();
            const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

            ffmpeg.on("progress", ({ progress }) => {
                setFiles(prev => {
                    const processing = prev.find(f => f.status === "processing" && f.mode === "client");
                    if (processing) {
                        return prev.map(f =>
                            f.id === processing.id ? { ...f, progress: Math.round(progress * 100) } : f
                        );
                    }
                    return prev;
                });
            });

            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
            });
            setFfmpegRef(ffmpeg);
            setLoaded(true);
        };
        load();
    }, []);

    // Persist files when they change
    useEffect(() => {
        if (loaded) {
            set("smartpress_files", files);
        }
    }, [files, loaded]);

    // Persist settings
    useEffect(() => {
        set("smartpress_video_crf", videoCrf);
        set("smartpress_image_quality", imageQuality);
    }, [videoCrf, imageQuality]);

    const generatePreview = async (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
        });
    };

    const handleFileSelect = async (uploadedFiles: FileList | null) => {
        if (!uploadedFiles) return;

        const newFiles: FileItem[] = [];
        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const preview = await generatePreview(file);
            newFiles.push({
                id: `${Date.now()}-${i}`,
                file,
                status: "pending",
                mode: file.type.startsWith("video") ? "server" : "client",
                progress: 0,
                preview,
            });
        }
        setFiles(prev => [...prev, ...newFiles]);
    };

    const handleDrag = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        handleFileSelect(e.dataTransfer.files);
    };

    const compressFile = async (fileItem: FileItem) => {
        setFiles(prev => prev.map(f =>
            f.id === fileItem.id ? { ...f, status: "queued" as FileStatus, progress: 0, errorMessage: undefined, jobId: undefined } : f
        ));

        try {
            if (fileItem.mode === "client") {
                // Client-side: skip straight to processing
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id ? { ...f, status: "processing" as FileStatus } : f
                ));
                await compressLocally(fileItem);
            } else {
                await compressOnServer(fileItem);
            }
        } catch (error) {
            console.error("Compression initiation error:", error);
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, status: "error" as FileStatus, errorMessage: (error instanceof Error ? error.message : 'An unexpected error occurred.') } : f
            ));
        }
    };

    const compressLocally = async (fileItem: FileItem) => {
        if (!ffmpegRef) return;
        const outputName = `smartpress_${fileItem.file.name}`;
        await ffmpegRef.writeFile(fileItem.file.name, await fetchFile(fileItem.file));

        // Use user-defined image quality
        await ffmpegRef.exec(["-i", fileItem.file.name, "-vf", "scale=1280:-1", "-q:v", imageQuality.toString(), outputName]);

        const data = await ffmpegRef.readFile(outputName);
        const buffer = data as unknown as ArrayBuffer;

        const downloadLink = URL.createObjectURL(new Blob([buffer], { type: fileItem.file.type }));
        setFiles(prev => prev.map(f =>
            f.id === fileItem.id ? {
                ...f,
                status: "done" as FileStatus,
                progress: 100,
                downloadLink,
                originalSize: fileItem.file.size,
                newSize: buffer.byteLength,
            } : f
        ));
    };

    const compressOnServer = async (fileItem: FileItem) => {
        const formData = new FormData();
        formData.append("file", fileItem.file);
        formData.append("crf", videoCrf.toString());

        try {
            // Phase 2: Use async mode by default
            const response = await fetch(`${API_URL}/compress-video?async=true`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
                throw new Error(errorData.detail || `Server error: ${response.status}`);
            }

            const result = await response.json();

            if (response.status === 202 && result.job_id) {
                // Async path — store job_id and start polling
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id ? { ...f, jobId: result.job_id, status: "queued" as FileStatus } : f
                ));
                startPolling(result.job_id, fileItem.id);
            } else {
                // Sync fallback path (shouldn't happen with async=true but just in case)
                if (!result || typeof result.original_size !== 'number' || typeof result.new_size !== 'number') {
                    throw new Error("Backend returned invalid compression data");
                }
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id ? {
                        ...f,
                        status: "done" as FileStatus,
                        progress: 100,
                        downloadLink: result.download_url,
                        originalSize: result.original_size,
                        newSize: result.new_size,
                    } : f
                ));
            }
        } catch (e: any) {
            console.error("Video compression error:", e);
            let errorMessage = "An unexpected error occurred.";

            if (e instanceof Error) {
                try {
                    const errorData = JSON.parse(e.message);
                    if (errorData && typeof errorData === 'object' && errorData.detail) {
                        errorMessage = errorData.detail;
                    } else {
                        errorMessage = e.message;
                    }
                } catch {
                    errorMessage = e.message;
                }
            } else if (typeof e === 'string') {
                errorMessage = e;
            }

            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, status: "error" as FileStatus, errorMessage } : f
            ));
        }
    };

    const retryFile = (fileItem: FileItem) => {
        // Reset to pending and re-trigger compression
        setFiles(prev => prev.map(f =>
            f.id === fileItem.id ? { ...f, status: "pending" as FileStatus, progress: 0, errorMessage: undefined, jobId: undefined } : f
        ));
        // Use setTimeout to let state update before re-triggering
        setTimeout(() => compressFile({ ...fileItem, status: "pending" }), 100);
    };

    const removeFile = (id: string) => {
        setFiles(prev => prev.filter(f => f.id !== id));
    };

    const clearAll = () => {
        setFiles([]);
    };

    const compressAll = async () => {
        const pendingFiles = files.filter(f => f.status === "pending");
        for (const fileItem of pendingFiles) {
            await compressFile(fileItem);
        }
    };

    const downloadAll = () => {
        const completedFiles = files.filter(f => f.status === "done" && f.downloadLink);
        completedFiles.forEach((fileItem, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = fileItem.downloadLink!;
                link.download = `smartpress_${fileItem.file.name}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 300);
        });
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    // Helper to render the status indicator for each file
    const renderStatusIndicator = (fileItem: FileItem) => {
        const config = STATUS_CONFIG[fileItem.status];
        const IconComponent = config.icon;

        switch (fileItem.status) {
            case "queued":
                return (
                    <div className="flex items-center gap-2 mt-2">
                        <div className="relative flex h-3 w-3">
                            <span
                                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                style={{ backgroundColor: config.color }}
                            />
                            <span
                                className="relative inline-flex rounded-full h-3 w-3"
                                style={{ backgroundColor: config.color }}
                            />
                        </div>
                        <span className="text-sm font-medium" style={{ color: config.color }}>
                            {config.label}
                        </span>
                    </div>
                );

            case "processing":
                return (
                    <div className="mb-2">
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                                className="h-full transition-all duration-500 ease-out"
                                style={{
                                    width: `${fileItem.progress}%`,
                                    background: `linear-gradient(90deg, #3b82f6, #6366f1)`,
                                }}
                            />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: config.color }}>
                                {fileItem.progress}% {config.label}
                            </p>
                            <Cpu size={12} className="animate-pulse" style={{ color: config.color }} />
                        </div>
                    </div>
                );

            case "finalizing":
                return (
                    <div className="mb-2">
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                                className="h-full animate-pulse"
                                style={{
                                    width: "100%",
                                    background: `linear-gradient(90deg, #f59e0b, #eab308)`,
                                }}
                            />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: config.color }}>
                            {config.label}
                        </p>
                    </div>
                );

            case "done":
                return (
                    fileItem.originalSize && fileItem.newSize ? (
                        <div className="flex items-center gap-2 mt-2 text-gray-500">
                            <CheckCircle size={14} className="text-green-500" />
                            <span className="text-sm">Compressed</span>
                            <span className="text-sm">→</span>
                            <span className="text-sm font-bold text-green-700">{formatBytes(fileItem.newSize)}</span>
                            <span className="text-xs font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                -{Math.round((1 - fileItem.newSize / fileItem.originalSize) * 100)}%
                            </span>
                        </div>
                    ) : null
                );

            case "error":
                return (
                    <div className="bg-red-50 text-red-700 text-xs px-3 py-1.5 rounded-md font-medium mt-2 flex items-center gap-2">
                        <AlertCircle size={14} />
                        <span>Error: {fileItem.errorMessage}</span>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className={`w-full h-full ${files.length === 0 ? 'min-h-[50vh] md:min-h-screen flex items-center justify-center' : 'py-6 md:p-12'}`}>
            <div className="w-full max-w-4xl mx-auto space-y-6">

                {/* Upload Area */}
                {loaded && (
                    <div className="space-y-4">
                        <div
                            className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${dragActive ? "border-blue-500 bg-blue-50 scale-105" : "border-gray-300 hover:bg-blue-50 hover:border-blue-400"
                                }`}
                            onClick={() => document.getElementById('file-upload')?.click()}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            <Upload className={`mb-4 transition-transform ${dragActive ? "scale-125" : ""}`} size={48} color={dragActive ? "#3b82f6" : "#6b7280"} />
                            <p className="text-lg font-medium text-gray-700 text-center">
                                {dragActive ? "Drop files here" : "Click or drag files to upload"}
                            </p>
                            <p className="text-sm text-gray-400 mt-2 text-center">
                                Images (JPG, PNG) • Videos (MP4) • Multiple files supported
                            </p>
                            <input
                                id="file-upload"
                                type="file"
                                className="hidden"
                                accept="image/*,video/*"
                                multiple
                                onChange={(e) => handleFileSelect(e.target.files)}
                            />
                        </div>

                        {/* Settings Toggle */}
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition font-medium"
                            >
                                <Settings2 size={16} /> {showSettings ? "Hide Settings" : "Compression Settings"}
                            </button>
                        </div>

                        {/* Settings Panel */}
                        {showSettings && (
                            <div className="bg-gray-50 rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-8 border border-gray-100">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-gray-700">Video Quality (CRF)</label>
                                        <span className="text-xs font-mono bg-white px-2 py-1 rounded border">{videoCrf}</span>
                                    </div>
                                    <input
                                        type="range" min="18" max="35" step="1"
                                        value={videoCrf} onChange={(e) => setVideoCrf(parseInt(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-400 font-medium">
                                        <span>HIGH QUALITY (18)</span>
                                        <span>SMALL FILE (35)</span>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-gray-700">Image Quality</label>
                                        <span className="text-xs font-mono bg-white px-2 py-1 rounded border">{imageQuality}</span>
                                    </div>
                                    <input
                                        type="range" min="1" max="31" step="1"
                                        value={imageQuality} onChange={(e) => setImageQuality(parseInt(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-400 font-medium">
                                        <span>BEST (1)</span>
                                        <span>SMALLEST (31)</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {!loaded && (
                    <div className="flex flex-col items-center py-10">
                        <Loader2 className="animate-spin text-blue-500 mb-2" size={32} />
                        <p className="text-gray-500 font-medium">Preparing the Smart-Bot...</p>
                    </div>
                )}

                {/* File Queue */}
                {files.length > 0 && (
                    <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800">File Queue ({files.length})</h2>
                            <div className="flex gap-3">
                                {files.some(f => f.status === "pending") && (
                                    <button
                                        onClick={compressAll}
                                        className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded transition font-medium"
                                    >
                                        Compress All
                                    </button>
                                )}
                                {files.some(f => f.status === "done" && f.downloadLink) && (
                                    <button
                                        onClick={downloadAll}
                                        className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded transition font-medium"
                                    >
                                        Download All
                                    </button>
                                )}
                                <button
                                    onClick={clearAll}
                                    className="text-sm text-red-500 hover:text-red-700 transition font-medium"
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {files.map(fileItem => (
                                <div key={fileItem.id} className="bg-gray-50 rounded-lg p-4 relative border border-transparent hover:border-gray-200 transition-colors">
                                    <button
                                        onClick={() => removeFile(fileItem.id)}
                                        className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded transition"
                                    >
                                        <X size={16} className="text-gray-500" />
                                    </button>

                                    <div className="flex items-start gap-4">
                                        <div className="flex-shrink-0 w-20 h-20 bg-gray-200 rounded overflow-hidden">
                                            {fileItem.preview && fileItem.file.type.startsWith("image") ? (
                                                <img src={fileItem.preview} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    {fileItem.file.type.startsWith("video") ? (
                                                        <FileVideo className="text-gray-400" size={32} />
                                                    ) : (
                                                        <ImageIcon className="text-gray-400" size={32} />
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="bg-blue-100 p-1 rounded">
                                                    {fileItem.mode === 'server' ? <Server size={14} className="text-blue-600" /> : <Monitor size={14} className="text-blue-600" />}
                                                </div>
                                                <p className="font-bold text-gray-800 truncate">{fileItem.file.name}</p>
                                                <span className="text-xs text-gray-500">{formatBytes(fileItem.file.size)}</span>
                                            </div>

                                            {/* Status Indicator — Phase 2 rich states */}
                                            {renderStatusIndicator(fileItem)}

                                            {/* Action Buttons */}
                                            <div className="flex gap-2 mt-2">
                                                {fileItem.status === "pending" && (
                                                    <button
                                                        onClick={() => compressFile(fileItem)}
                                                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition font-bold uppercase tracking-wider"
                                                    >
                                                        Compress
                                                    </button>
                                                )}
                                                {fileItem.status === "error" && (
                                                    <button
                                                        onClick={() => retryFile(fileItem)}
                                                        className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded transition font-bold uppercase tracking-wider inline-flex items-center gap-1"
                                                    >
                                                        <RefreshCw size={12} /> Retry
                                                    </button>
                                                )}
                                                {fileItem.status === "done" && fileItem.downloadLink && (
                                                    <a
                                                        href={fileItem.downloadLink}
                                                        download={`smartpress_${fileItem.file.name}`}
                                                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded transition inline-flex items-center gap-1 font-bold uppercase tracking-wider"
                                                    >
                                                        <Download size={14} /> Download
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}