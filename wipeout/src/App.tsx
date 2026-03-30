import React, { useState, useRef, useEffect } from 'react';
import './App.css';

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
    if (image && image.startsWith('blob:')) URL.revokeObjectURL(image);
    setOriginalFile(file);
    setImage(URL.createObjectURL(file));
    setResultImage(null);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (image && image.startsWith('blob:')) URL.revokeObjectURL(image);
      setOriginalFile(file);
      setImage(URL.createObjectURL(file));
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
    worker.postMessage({ type: 'remove-background', image });
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
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = mask.width;
      maskCanvas.height = mask.height;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) return;

      const maskImageData = maskCtx.createImageData(mask.width, mask.height);
      const maskData = maskImageData.data;
      const resultData = mask.data;

      if (mask.channels === 1) {
        for (let i = 0; i < resultData.length; ++i) {
          maskData[(i << 2) + 3] = resultData[i];
        }
      } else if (mask.channels === 3) {
        for (let i = 0; i < resultData.length / 3; ++i) {
          maskData[(i << 2) + 3] = resultData[3 * i];
        }
      } else if (mask.channels === 4) {
        for (let i = 0; i < resultData.length / 4; ++i) {
          maskData[(i << 2) + 3] = resultData[(i << 2) + 3];
        }
      }
      maskCtx.putImageData(maskImageData, 0, 0);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';

      if (resultImage && resultImage.startsWith('blob:')) URL.revokeObjectURL(resultImage);

      canvas.toBlob((blob) => {
        if (blob) {
          setResultImage(URL.createObjectURL(blob));
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
    if (image && image.startsWith('blob:')) URL.revokeObjectURL(image);
    if (resultImage && resultImage.startsWith('blob:')) URL.revokeObjectURL(resultImage);
    setImage(null);
    setResultImage(null);
    setOriginalFile(null);
    setError(null);
    setProgress(0);
  };

  const statusText = status === 'loading' && progress < 100
    ? `Downloading AI model: ${progress.toFixed(0)}%`
    : status === 'processing'
      ? 'AI is analyzing image...'
      : status === 'rendering'
        ? 'Generating HD output...'
        : 'Preparing AI engine...';

  return (
    <>
      <a href="/" className="back-link">
        <i className="ph ph-arrow-left"></i> Back to Shrine
      </a>

      <div style={{ marginTop: '5rem', width: '100%' }}>
        <div className="tool-header">
          <h1 style={{ color: '#fff', fontSize: '2.5rem', marginBottom: '0.5rem' }}>Wipeout</h1>
          <p style={{ color: 'var(--text-muted)' }}>AI-powered background removal. No cloud, no credits, fully private.</p>
        </div>

        <div className="tool-container">
          {!image ? (
            <label
              className={`upload-area ${isDragging ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <i className="ph ph-eraser"></i>
              <h3>{isDragging ? 'Drop it now!' : 'Drop your image here'}</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                PNG, JPG or WebP up to 10MB
              </p>
              <input type="file" style={{ display: 'none' }} onChange={handleUpload} accept="image/*" />
            </label>
          ) : (
            <>
              <div className="editor-header">
                <div className="editor-file-info">
                  <i className="ph ph-image" style={{ color: 'var(--text-muted)' }}></i>
                  <span className="editor-filename">{originalFile?.name}</span>
                </div>
                <button className="reset-btn" onClick={reset} title="Remove image">
                  <i className="ph ph-trash"></i>
                </button>
              </div>

              <div className="comparison-grid">
                <div className="comparison-col">
                  <p className="comparison-label">Original</p>
                  <div className="image-frame">
                    <img src={image} alt="Original" />
                  </div>
                </div>

                <div className="comparison-col">
                  <p className="comparison-label">Result</p>
                  <div className="image-frame checkerboard">
                    {resultImage ? (
                      <img src={resultImage} alt="Result" />
                    ) : (
                      <div className="placeholder">
                        {isProcessing ? (
                          <div className="processing-status">
                            <div className="spinner"></div>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                            </div>
                            <p className="processing-text">{statusText}</p>
                          </div>
                        ) : (
                          <p className="idle-text">Click process to remove background</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="action-row">
                {!resultImage ? (
                  <button className="btn" onClick={processImage} disabled={isProcessing} style={{ display: 'block' }}>
                    {isProcessing ? (
                      <><span className="btn-spinner"></span> Processing...</>
                    ) : (
                      'Remove Background'
                    )}
                  </button>
                ) : (
                  <button className="btn btn-download" onClick={downloadImage} style={{ display: 'block' }}>
                    <i className="ph ph-download-simple"></i> Download HD Result
                  </button>
                )}
              </div>
            </>
          )}

          {error && (
            <div className="error-box">
              <i className="ph ph-warning-circle"></i>
              <div>
                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Processing Error</p>
                <p style={{ opacity: 0.8 }}>{error}</p>
              </div>
            </div>
          )}

          <div className="status-text">
            <i className="ph ph-shield-check" style={{ color: '#eab308' }}></i>
            Your images never leave your browser. All AI processing happens locally on your device.
          </div>
        </div>

      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </>
  );
}
