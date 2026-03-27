import { pipeline, env } from '@huggingface/transformers';

// Skip local model check
env.allowLocalModels = false;

let remover: any = null;

async function getPipeline(progress_callback: (data: any) => void) {
  if (!remover) {
    remover = await pipeline('image-segmentation', 'briaai/RMBG-1.4', {
      progress_callback,
    });
  }
  return remover;
}

self.onmessage = async (event) => {
  const { image, type } = event.data;

  if (type === 'load') {
    try {
      await getPipeline((data) => {
        (self as any).postMessage({ type: 'download-progress', data });
      });
      (self as any).postMessage({ type: 'loaded' });
    } catch (error: any) {
      (self as any).postMessage({ type: 'error', error: error.message });
    }
    return;
  }

  if (type === 'remove-background') {
    try {
      const pipe = await getPipeline((data) => {
        (self as any).postMessage({ type: 'download-progress', data });
      });
      
      (self as any).postMessage({ type: 'processing-started' });
      
      // Process the image
      const output = await pipe(image);
      
      // For 'image-segmentation', Transformers.js returns an array of objects
      // Each object has a 'mask' property which is a RawImage
      const mask = Array.isArray(output) ? output[0].mask : output;

      if (!mask || !mask.data) {
        throw new Error('Failed to generate mask from image');
      }
      
      // The output is a RawImage object
      // We need to extract the data to send it back
      // RawImage has: data, width, height, channels
      
      (self as any).postMessage({ 
        type: 'result', 
        result: {
          data: mask.data,
          width: mask.width,
          height: mask.height,
          channels: mask.channels
        } 
      }, [mask.data.buffer]); // Use transferable for performance
    } catch (error: any) {
      (self as any).postMessage({ type: 'error', error: error.message });
    }
  }
};
