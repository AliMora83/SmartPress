"use client";

import { useState, useRef, useEffect, DragEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Upload, FileVideo, Download, Loader2, CheckCircle, Server, Monitor, Sparkles, Tag, X, Image as ImageIcon, Settings2 } from "lucide-react";
import { get, set } from "idb-keyval";

interface FileItem {
    id: string;
    file: File;
    status: "pending" | "compressing" | "done" | "error";
    mode: "client" | "server";
    progress: number;
    preview?: string;
    // metrics removed
    downloadLink?: string;
    aiResult?: { title: string; description: string; hashtags: string[] };
}

export default function Compressor() {
    const [loaded, setLoaded] = useState(false);
    const [ffmpegRef, setFfmpegRef] = useState<FFmpeg | null>(null);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    
    // Quality Settings
    const [videoCrf, setVideoCrf] = useState(28);
    const [imageQuality, setImageQuality] = useState(15);
    const [showSettings, setShowSettings] = useState(false);

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
                    return { ...f, preview, status: f.status === "compressing" ? "pending" : f.status };
                }));
                setFiles(restoredFiles);
            }

            const ffmpeg = new FFmpeg();
            const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

            ffmpeg.on("progress", ({ progress }) => {
                setFiles(prev => {
                    const processing = prev.find(f => f.status === "compressing" && f.mode === "client");
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
            f.id === fileItem.id ? { ...f, status: "compressing", progress: 0 } : f
        ));

        try {
            if (fileItem.mode === "client") {
                await compressLocally(fileItem);
            } else {
                await compressOnServer(fileItem);
            }
        } catch (error) {
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, status: "error" } : f
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
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const buffer = data;

        const downloadLink = URL.createObjectURL(new Blob([buffer], { type: fileItem.file.type }));
        setFiles(prev => prev.map(f =>
            f.id === fileItem.id ? {
                ...f,
                status: "done",
                progress: 100,
                downloadLink,
            } : f
        ));
    };

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    const compressOnServer = async (fileItem: FileItem) => {
        const formData = new FormData();
        formData.append("file", fileItem.file);
        formData.append("crf", videoCrf.toString()); // Pass user CRF to backend

        let simulatedProgress = 0;
        const progressInterval = setInterval(() => {
            simulatedProgress += 5;
            if (simulatedProgress <= 95) {
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id ? { ...f, progress: simulatedProgress } : f
                ));
            }
        }, 800);

        try {
            const response = await fetch(`${API_URL}/compress-video`, { method: "POST", body: formData });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
                throw new Error(errorData.detail || `Server error: ${response.status}`);
            }

            const result = await response.json();

            if (!result || typeof result.original_size !== 'number' || typeof result.new_size !== 'number') {
                throw new Error("Backend returned invalid compression data");
            }

            clearInterval(progressInterval);
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? {
                    ...f,
                    status: "done",
                    progress: 100,
                    downloadLink: result.download_url,
                } : f
            ));
        } catch (e) {
            clearInterval(progressInterval);
            console.error("Video compression error:", e);
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, status: "error" } : f
            ));
        }
    };

    const runAiAnalysis = async (fileItem: FileItem) => {
        setIsAnalyzing(true);
        const formData = new FormData();
        formData.append("file", fileItem.file);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000);

        try {
            const response = await fetch(`${API_URL}/analyze-video`, {
                method: "POST",
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
                throw new Error(errorData.detail || `Server error: ${response.status}`);
            }

            const result = await response.json();

            if (!result || !result.analysis) {
                throw new Error("Backend returned no analysis data.");
            }

            const analysisText = result.analysis;
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(analysisText);
            
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, aiResult: parsed } : f
            ));
        } catch (e) {
            console.error("AI Analysis Error:", e);
            alert("AI Analysis failed. Check console for details.");
        } finally {
            clearTimeout(timeoutId);
            setIsAnalyzing(false);
        }
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

    const currentVideoFile = files.find(f => f.mode === "server" && f.status === "done");

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

                                            {fileItem.status === "compressing" && (
                                                <div className="mb-2">
                                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                                        <div
                                                            className="bg-blue-600 h-full transition-all duration-300"
                                                            style={{ width: `${fileItem.progress}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase tracking-wider">{fileItem.progress}% processing</p>
                                                </div>
                                            )}

                                                    <span className="text-sm">→</span>
                                                    <span className="text-sm font-bold text-green-700">{formatBytes(fileItem.metrics.newSize)}</span>
                                                    <span className="text-xs font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                                        -{Math.round((1 - fileItem.metrics.newSize / fileItem.metrics.originalSize) * 100)}%
                                                    </span>
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                {fileItem.status === "pending" && (
                                                    <button
                                                        onClick={() => compressFile(fileItem)}
                                                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition font-bold uppercase tracking-wider"
                                                    >
                                                        Compress
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

                {/* AI Analysis Panel */}
                {currentVideoFile && (
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-6 shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4">
                            AI Intelligence <span className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded uppercase tracking-widest">Pro</span>
                        </h2>

                        {!currentVideoFile.aiResult && !isAnalyzing && (
                            <div className="text-center py-4">
                                <Sparkles className="mx-auto text-purple-500 mb-3" size={32} />
                                <p className="text-gray-600 text-sm mb-4 font-medium">
                                    Let the Smart-Bot analyze your video for viral potential.
                                </p>
                                <button
                                    onClick={() => runAiAnalysis(currentVideoFile)}
                                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition flex items-center gap-2 mx-auto uppercase tracking-wider shadow-md"
                                >
                                    <Sparkles size={16} /> Analyze Video
                                </button>
                            </div>
                        )}

                        {isAnalyzing && (
                            <div className="text-center py-8">
                                <Loader2 className="animate-spin text-purple-600 mx-auto mb-2" />
                                <p className="text-purple-800 text-sm font-bold uppercase tracking-widest animate-pulse">Analyzing Content...</p>
                            </div>
                        )}

                        {currentVideoFile.aiResult && (
                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black text-purple-800 uppercase tracking-widest mb-1 block">Suggested Title</label>
                                    <p className="text-lg text-gray-900 font-extrabold leading-tight">{currentVideoFile.aiResult.title}</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-purple-800 uppercase tracking-widest mb-1 block">Description</label>
                                    <p className="text-gray-700 text-sm leading-relaxed font-medium">{currentVideoFile.aiResult.description}</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-purple-800 uppercase tracking-widest mb-1 block">Viral Tags</label>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {currentVideoFile.aiResult.hashtags.map(tag => (
                                            <span key={tag} className="flex items-center gap-1 bg-white border border-purple-200 text-purple-600 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm">
                                                <Tag size={12} /> {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
