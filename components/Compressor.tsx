"use client";

import { useState, useEffect, DragEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Upload, FileVideo, Download, Loader2, CheckCircle, Server, Monitor, Sparkles, Tag, X, Image as ImageIcon } from "lucide-react";

interface FileItem {
    id: string;
    file: File;
    status: "pending" | "compressing" | "done" | "error";
    mode: "client" | "server";
    progress: number;
    preview?: string;
    metrics?: { originalSize: number; newSize: number };
    downloadLink?: string;
    aiResult?: { title: string; description: string; hashtags: string[] };
}

export default function Compressor() {
    const [loaded, setLoaded] = useState(false);
    const [ffmpegRef, setFfmpegRef] = useState<FFmpeg | null>(null);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    useEffect(() => {
        const load = async () => {
            const ffmpeg = new FFmpeg();
            const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

            ffmpeg.on("progress", ({ progress }) => {
                // Update progress for current file being processed
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
        } catch {
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, status: "error" } : f
            ));
        }
    };

    const compressLocally = async (fileItem: FileItem) => {
        if (!ffmpegRef) return;
        const outputName = `smartpress_${fileItem.file.name}`;
        await ffmpegRef.writeFile(fileItem.file.name, await fetchFile(fileItem.file));
        await ffmpegRef.exec(["-i", fileItem.file.name, "-vf", "scale=1280:-1", "-q:v", "15", outputName]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await ffmpegRef.readFile(outputName)) as any;

        const downloadLink = URL.createObjectURL(new Blob([data.buffer], { type: fileItem.file.type }));
        setFiles(prev => prev.map(f =>
            f.id === fileItem.id ? {
                ...f,
                status: "done",
                progress: 100,
                metrics: { originalSize: fileItem.file.size, newSize: data.buffer.byteLength },
                downloadLink,
            } : f
        ));
    };

    const compressOnServer = async (fileItem: FileItem) => {
        const formData = new FormData();
        formData.append("file", fileItem.file);

        // Simulate progress for server upload
        let simulatedProgress = 0;
        const progressInterval = setInterval(() => {
            simulatedProgress += 10;
            if (simulatedProgress <= 90) {
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id ? { ...f, progress: simulatedProgress } : f
                ));
            }
        }, 500);

        try {
            const response = await fetch("http://localhost:8000/compress-video", { method: "POST", body: formData });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
                throw new Error(errorData.detail || `Server error: ${response.status}`);
            }

            const result = await response.json();

            // Validate response data
            if (!result || typeof result.original_size !== 'number' || typeof result.new_size !== 'number') {
                console.error("Invalid compression response:", result);
                throw new Error("Backend returned invalid compression data");
            }

            clearInterval(progressInterval);
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? {
                    ...f,
                    status: "done",
                    progress: 100,
                    metrics: { originalSize: result.original_size, newSize: result.new_size },
                    downloadLink: result.download_url,
                } : f
            ));
        } catch (e) {
            clearInterval(progressInterval);
            console.error("Video compression error:", e);
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, status: "error" } : f
            ));
            const errorMessage = e instanceof Error ? e.message : "Unknown error";
            alert(`Video compression failed: ${errorMessage}\n\nCheck browser console for details.`);
        }
    };

    const runAiAnalysis = async (fileItem: FileItem) => {
        setIsAnalyzing(true);
        const formData = new FormData();
        formData.append("file", fileItem.file);

        // Create an AbortController with a 10-minute timeout for long video processing
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes

        try {
            const response = await fetch("http://localhost:8000/analyze-video", {
                method: "POST",
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Check if response is ok
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
                throw new Error(errorData.detail || `Server error: ${response.status}`);
            }

            const result = await response.json();

            // Validate that we got the expected data
            if (!result || !result.analysis) {
                console.error("Invalid response from backend:", result);
                throw new Error("Backend returned no analysis data. Check backend console for errors.");
            }

            const parsed = JSON.parse(result.analysis);
            setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, aiResult: parsed } : f
            ));
        } catch (e) {
            console.error("AI Analysis Error:", e);
            if (e instanceof Error && e.name === 'AbortError') {
                alert("AI Analysis timed out (took longer than 10 minutes).\n\nThis can happen with large videos. Try a shorter video or wait for Gemini to process.");
            } else {
                const errorMessage = e instanceof Error ? e.message : "Unknown error";
                alert(`AI Analysis failed: ${errorMessage}\n\nCheck the browser console and backend terminal for details.`);
            }
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
            // Small delay between downloads to avoid browser blocking
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
                )}

                {!loaded && (
                    <div className="flex flex-col items-center py-10">
                        <Loader2 className="animate-spin text-blue-500 mb-2" size={32} />
                        <p className="text-gray-500">Loading compression engine...</p>
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
                                        Compress All ({files.filter(f => f.status === "pending").length})
                                    </button>
                                )}
                                {files.some(f => f.status === "done" && f.downloadLink) && (
                                    <button
                                        onClick={downloadAll}
                                        className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded transition font-medium"
                                    >
                                        Download All ({files.filter(f => f.status === "done" && f.downloadLink).length})
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
                                <div key={fileItem.id} className="bg-gray-50 rounded-lg p-4 relative">
                                    {/* Remove Button */}
                                    <button
                                        onClick={() => removeFile(fileItem.id)}
                                        className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded transition"
                                    >
                                        <X size={16} className="text-gray-500" />
                                    </button>

                                    <div className="flex items-start gap-4">
                                        {/* Preview Thumbnail */}
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
                                            {/* File Info */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="bg-blue-100 p-1 rounded">
                                                    {fileItem.mode === 'server' ? <Server size={14} className="text-blue-600" /> : <Monitor size={14} className="text-blue-600" />}
                                                </div>
                                                <p className="font-medium text-gray-800 truncate">{fileItem.file.name}</p>
                                                <span className="text-xs text-gray-500">{formatBytes(fileItem.file.size)}</span>
                                            </div>

                                            {/* Progress Bar */}
                                            {fileItem.status === "compressing" && (
                                                <div className="mb-2">
                                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                                        <div
                                                            className="bg-blue-600 h-full transition-all duration-300"
                                                            style={{ width: `${fileItem.progress}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-1">{fileItem.progress}% complete</p>
                                                </div>
                                            )}

                                            {/* Success State */}
                                            {fileItem.status === "done" && fileItem.metrics && (
                                                <div className="flex items-center gap-3 mb-2">
                                                    <CheckCircle size={16} className="text-green-600" />
                                                    <span className="text-sm text-gray-500 line-through">{formatBytes(fileItem.metrics.originalSize)}</span>
                                                    <span className="text-sm">→</span>
                                                    <span className="text-sm font-bold text-green-700">{formatBytes(fileItem.metrics.newSize)}</span>
                                                    <span className="text-xs text-green-600">
                                                        {Math.round((1 - fileItem.metrics.newSize / fileItem.metrics.originalSize) * 100)}% saved
                                                    </span>
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className="flex gap-2">
                                                {fileItem.status === "pending" && (
                                                    <button
                                                        onClick={() => compressFile(fileItem)}
                                                        className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition"
                                                    >
                                                        Compress
                                                    </button>
                                                )}
                                                {fileItem.status === "done" && fileItem.downloadLink && (
                                                    <a
                                                        href={fileItem.downloadLink}
                                                        download={`smartpress_${fileItem.file.name}`}
                                                        className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition inline-flex items-center gap-1"
                                                    >
                                                        <Download size={14} /> Download
                                                    </a>
                                                )}
                                                {fileItem.status === "error" && (
                                                    <span className="text-sm text-red-600">Error processing file</span>
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
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4">
                        AI Intelligence <span className="bg-purple-100 text-purple-600 text-xs px-2 py-0.5 rounded-full">Pro</span>
                    </h2>

                    {!currentVideoFile.aiResult && !isAnalyzing && (
                        <div className="text-center">
                            <Sparkles className="mx-auto text-purple-500 mb-3" size={32} />
                            <p className="text-gray-600 text-sm mb-4">
                                Use Gemini 1.5 Pro to analyze this video and generate viral metadata.
                            </p>
                            <button
                                onClick={() => runAiAnalysis(currentVideoFile)}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 mx-auto"
                            >
                                <Sparkles size={16} /> Analyze Video
                            </button>
                        </div>
                    )}

                    {isAnalyzing && (
                        <div className="text-center py-8">
                            <Loader2 className="animate-spin text-purple-600 mx-auto mb-2" />
                            <p className="text-purple-800 text-sm font-medium">Gemini is watching your video...</p>
                        </div>
                    )}

                    {currentVideoFile.aiResult && (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-purple-800 uppercase">Suggested Title</label>
                                <p className="text-gray-900 font-medium leading-tight">{currentVideoFile.aiResult.title}</p>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-purple-800 uppercase">Description</label>
                                <p className="text-gray-600 text-sm">{currentVideoFile.aiResult.description}</p>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-purple-800 uppercase">Tags</label>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {currentVideoFile.aiResult.hashtags.map(tag => (
                                        <span key={tag} className="flex items-center gap-1 bg-white border border-purple-200 text-purple-600 px-2 py-1 rounded text-xs">
                                            <Tag size={10} /> {tag}
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
