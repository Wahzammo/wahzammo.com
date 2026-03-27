import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Loader2, Image as ImageIcon, CheckCircle2, AlertCircle, Trash2, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'rendering' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isProcessing = status !== 'idle' && status !== 'error';

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Initialize worker
    const newWorker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });

    newWorker.onmessage = (event) => {
      const { type, data, result, error } = event.data;

      if (type === 'download-progress') {
        if (data.status === 'progress') {
          setProgress(data.progress);
        }
      } else if (type === 'loaded') {
        setStatus('idle');
      } else if (type === 'processing-started') {
        setStatus('processing');
      } else if (type === 'result') {
        setStatus('rendering');
        renderResult(result);
      } else if (type === 'error') {
        setError(error);
        setStatus('error');
      }
    };

    setWorker(newWorker);

    return () => {
      newWorker.terminate();
      if (image && image.startsWith('blob:')) URL.revokeObjectURL(image);
      if (resultImage && resultImage.startsWith('blob:')) URL.revokeObjectURL(resultImage);
    };
  }, [image, resultImage]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Revoke old URL if exists
    if (image && image.startsWith('blob:')) {
      URL.revokeObjectURL(image);
    }
    
    setOriginalFile(file);
    const objectUrl = URL.createObjectURL(file);
    setImage(objectUrl);
    setResultImage(null);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (image && image.startsWith('blob:')) {
        URL.revokeObjectURL(image);
      }
      setOriginalFile(file);
      const objectUrl = URL.createObjectURL(file);
      setImage(objectUrl);
      setResultImage(null);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const processImage = async () => {
    if (!worker || !image) return;

    setStatus('loading');
    setError(null);
    setProgress(0);

    worker.postMessage({
      type: 'remove-background',
      image: image,
    });
  };

  const renderResult = (mask: any) => {
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Get original image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;

      // The mask is a RawImage with alpha values
      // Transformers.js RawImage result for RMBG-1.4 is usually a mask
      // We need to resize the mask to match the image if it's different
      // But RMBG-1.4 usually returns a mask of the same size or we can resize it
      
      // For simplicity, let's assume the mask matches or we use a temporary canvas to resize it
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = mask.width;
      maskCanvas.height = mask.height;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) return;

      const maskImageData = maskCtx.createImageData(mask.width, mask.height);
      const maskData = maskImageData.data;
      const resultData = mask.data;
      
      // Handle different channel counts with optimized loops
      if (mask.channels === 1) {
        for (let i = 0; i < resultData.length; ++i) {
          const idx = i << 2;
          maskData[idx + 3] = resultData[i];
        }
      } else if (mask.channels === 3) {
        for (let i = 0; i < resultData.length / 3; ++i) {
          const idx = i << 2;
          maskData[idx + 3] = resultData[3 * i];
        }
      } else if (mask.channels === 4) {
        for (let i = 0; i < resultData.length / 4; ++i) {
          const idx = i << 2;
          maskData[idx + 3] = resultData[idx + 3];
        }
      }
      maskCtx.putImageData(maskImageData, 0, 0);

      // Clear main canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Use destination-in to apply the mask
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';

      // Revoke old result URL if exists
      if (resultImage && resultImage.startsWith('blob:')) {
        URL.revokeObjectURL(resultImage);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setResultImage(url);
          setStatus('idle');
        } else {
          setError('Failed to generate result image');
          setStatus('error');
        }
      }, 'image/png');
    };
    img.src = image;
  };

  const downloadImage = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `removed-bg-${originalFile?.name.split('.')[0] || 'image'}.png`;
    link.click();
  };

  const reset = () => {
    if (image && image.startsWith('blob:')) {
      URL.revokeObjectURL(image);
    }
    if (resultImage && resultImage.startsWith('blob:')) {
      URL.revokeObjectURL(resultImage);
    }
    setImage(null);
    setResultImage(null);
    setOriginalFile(null);
    setError(null);
    setProgress(0);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-[Outfit] selection:bg-orange-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* Back to Shrine */}
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-white/40 hover:text-white transition-colors text-sm mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Shrine
        </a>
        {/* Header */}
        <header className="flex flex-col items-center mb-16 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-6"
          >
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-xs font-medium tracking-wider uppercase text-white/60">Unlimited HD Processing</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-6xl md:text-8xl font-black tracking-tighter mb-6 bg-gradient-to-b from-orange-400 to-red-600 bg-clip-text text-transparent italic uppercase"
          >
            WipeOut
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/40 max-w-xl leading-relaxed font-mono"
          >
            Extreme background removal for the bold. 
            No credits, no cloud, just pure AI power.
          </motion.p>
        </header>

        {/* Main Interface */}
        <div className="grid grid-cols-1 gap-8">
          <AnimatePresence mode="wait">
            {!image ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative group"
              >
                <label 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center w-full h-[400px] border-2 border-dashed rounded-3xl bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer ${isDragging ? 'border-orange-500 bg-orange-500/5' : 'border-white/10 group-hover:border-orange-500/50'}`}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <div className={`w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 transition-transform ${isDragging ? 'scale-110' : 'group-hover:scale-110'}`}>
                      <Upload className={`w-8 h-8 transition-colors ${isDragging ? 'text-orange-500' : 'text-white/60 group-hover:text-orange-500'}`} />
                    </div>
                    <p className="text-xl font-medium mb-2">{isDragging ? 'Drop it now!' : 'Drop your image here'}</p>
                    <p className="text-sm text-white/40">PNG, JPG or WEBP up to 10MB</p>
                  </div>
                  <input type="file" className="hidden" onChange={handleUpload} accept="image/*" />
                </label>
              </motion.div>
            ) : (
              <motion.div
                key="editor"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/[0.02] border border-white/10 rounded-3xl overflow-hidden"
              >
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-white/60" />
                    </div>
                    <span className="text-sm font-medium text-white/80 truncate max-w-[200px]">
                      {originalFile?.name}
                    </span>
                  </div>
                  <button 
                    onClick={reset}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Original */}
                    <div className="space-y-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Original</p>
                      <div className="aspect-square rounded-2xl overflow-hidden bg-black/40 border border-white/5 relative group">
                        <img src={image} alt="Original" className="w-full h-full object-contain" />
                      </div>
                    </div>

                    {/* Result */}
                    <div className="space-y-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Result</p>
                      <div className="aspect-square rounded-2xl overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-black/40 border border-white/5 relative flex items-center justify-center">
                        {resultImage ? (
                          <motion.img 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            src={resultImage} 
                            alt="Result" 
                            className="w-full h-full object-contain" 
                          />
                        ) : (
                          <div className="flex flex-col items-center text-center px-6">
                            {isProcessing ? (
                              <div className="space-y-6 w-full max-w-[200px]">
                                <div className="flex justify-center">
                                  <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                                </div>
                                <div className="space-y-2">
                                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div 
                                      className="h-full bg-orange-500"
                                      initial={{ width: 0 }}
                                      animate={{ width: `${progress}%` }}
                                    />
                                  </div>
                                  <p className="text-[10px] font-mono uppercase tracking-tighter text-white/40">
                                    {status === 'loading' && progress < 100 
                                      ? `Downloading Model: ${progress.toFixed(0)}%` 
                                      : status === 'processing' 
                                        ? 'AI is analyzing image...' 
                                        : status === 'rendering'
                                          ? 'Generating HD output...'
                                          : 'Preparing AI Engine...'}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-white/20 italic">Click process to remove background</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                    {!resultImage ? (
                      <button
                        onClick={processImage}
                        disabled={isProcessing}
                        className="w-full sm:w-auto px-12 py-4 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            Remove Background
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={downloadImage}
                        className="w-full sm:w-auto px-12 py-4 rounded-2xl bg-white hover:bg-white/90 text-black font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
                      >
                        <Download className="w-5 h-5" />
                        Download HD Result
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold mb-1">Processing Error</p>
                <p className="opacity-80">{error}</p>
              </div>
            </motion.div>
          )}

          {/* Ko-fi Tip Section */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col items-center gap-4 py-12 border-t border-white/5 mt-8"
          >
            <p className="text-sm text-white/30 font-mono uppercase tracking-widest">WipeOut is free forever. Tips keep it fast.</p>
            <a 
              href="https://ko-fi.com/wahzammo" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-6 py-3 rounded-xl bg-[#f45d22] hover:bg-[#d44d1a] transition-all hover:scale-105 active:scale-95 font-bold"
            >
              <img 
                src="https://ko-fi.com/img/githubbutton_sm.svg" 
                alt="Ko-fi" 
                className="h-6"
                referrerPolicy="no-referrer"
              />
              Support me on Ko-fi
            </a>
          </motion.div>
        </div>

        {/* Hidden Canvas for Processing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Features */}
        <footer className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-12 border-t border-white/5 pt-12">
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-orange-500" />
            </div>
            <h3 className="font-bold text-lg">Privacy First</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              Your images never leave your browser. All AI processing happens locally on your device.
            </p>
          </div>
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="font-bold text-lg">High Definition</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              Unlike other tools, we don't downscale your results. Get the full resolution for free.
            </p>
          </div>
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="font-bold text-lg">Open Source</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              Powered by RMBG-1.4, a state-of-the-art open-source model optimized for web performance.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
