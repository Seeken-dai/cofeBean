// 咖啡袋手账封面生成器：按需加载本地 MediaPipe 模型，静默输出带撕纸白边的透明 PNG。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppSubjectCrop = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_INFERENCE_SIDE = 1280;
  const THRESHOLD = 0.70;
  const FEATHER_PX = 3;
  const PAPER_WIDTH_RATIO = 0.05;
  const MASK_MARGIN_RATIO = 0.04;
  const MASK_SOFTNESS = 0.08;
  const MODEL_PATH = './vendor/mediapipe/models/magic_touch.tflite';
  const WASM_PATH = './vendor/mediapipe/wasm';
  const VISION_MODULE_PATH = './vendor/mediapipe/vision_bundle.mjs';

  function create(deps) {
    const core = deps && deps.core;
    if (!core) throw new Error('AppSubjectCrop.create 缺少依赖:core');
    const inferenceCanvas = document.createElement('canvas');
    const graphCanvas = document.createElement('canvas');
    let segmenter = null;
    let segmenterPromise = null;

    function notify(callback, phase, detail) {
      if (typeof callback === 'function') callback({ phase, detail: detail || '' });
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('无法读取这张咖啡袋图片'));
        image.src = src;
      });
    }

    function prepareInference(image) {
      const scale = Math.min(1, MAX_INFERENCE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      inferenceCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      inferenceCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = inferenceCanvas.getContext('2d');
      context.clearRect(0, 0, inferenceCanvas.width, inferenceCanvas.height);
      context.drawImage(image, 0, 0, inferenceCanvas.width, inferenceCanvas.height);
    }

    async function ensureSegmenter() {
      if (segmenter) return segmenter;
      if (segmenterPromise) return segmenterPromise;
      segmenterPromise = (async () => {
        const visionTasks = await import(VISION_MODULE_PATH);
        const vision = await visionTasks.FilesetResolver.forVisionTasks(WASM_PATH);
        const options = (delegate) => ({
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false, canvas: graphCanvas
        });
        try {
          segmenter = await visionTasks.InteractiveSegmenter.createFromOptions(vision, options('GPU'));
        } catch (gpuError) {
          console.warn('手账封面 GPU 初始化失败，回退 CPU：', gpuError);
          segmenter = await visionTasks.InteractiveSegmenter.createFromOptions(vision, options('CPU'));
        }
        return segmenter;
      })();
      try { return await segmenterPromise; } catch (error) { segmenterPromise = null; throw error; }
    }

    function maskCanvas(mask, width, height) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      const alpha = core.buildAlphaValues(mask, width, height, { threshold: THRESHOLD, softness: MASK_SOFTNESS });
      const data = context.createImageData(width, height);
      for (let index = 0; index < alpha.length; index += 1) {
        const offset = index * 4;
        data.data[offset] = 255; data.data[offset + 1] = 255; data.data[offset + 2] = 255; data.data[offset + 3] = alpha[index];
      }
      context.putImageData(data, 0, 0);
      return canvas;
    }

    function paperSeedCanvas(mask, width, height) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d'); const data = context.createImageData(width, height);
      const alpha = core.buildOpaqueAlphaValues(mask, width, height, { threshold: THRESHOLD });
      for (let index = 0; index < alpha.length; index += 1) {
        const offset = index * 4;
        data.data[offset] = 255; data.data[offset + 1] = 255; data.data[offset + 2] = 255; data.data[offset + 3] = alpha[index];
      }
      context.putImageData(data, 0, 0);
      return canvas;
    }

    function render(image, rawMask, maskWidth, maskHeight) {
      const subjectMask = core.keepConnectedComponent(rawMask, maskWidth, maskHeight, { x: 0.5, y: 0.5 }, { threshold: THRESHOLD - MASK_SOFTNESS });
      const cropMarginRatio = Math.max(MASK_MARGIN_RATIO, PAPER_WIDTH_RATIO + 0.02);
      const bounds = core.computeMaskBounds(subjectMask, maskWidth, maskHeight, { threshold: THRESHOLD, marginRatio: cropMarginRatio });
      if (!bounds) throw new Error('没有识别到连续的咖啡袋主体');
      const alphaMask = maskCanvas(subjectMask, maskWidth, maskHeight);
      const desiredMargin = Math.round(Math.max(bounds.subject.width, bounds.subject.height) * cropMarginRatio);
      const edgePadding = core.computeEdgePadding(bounds, desiredMargin);
      const sourceScaleX = image.naturalWidth / maskWidth; const sourceScaleY = image.naturalHeight / maskHeight;
      const sourceX = Math.floor(bounds.x * sourceScaleX); const sourceY = Math.floor(bounds.y * sourceScaleY);
      const sourceRight = Math.min(image.naturalWidth, Math.ceil((bounds.x + bounds.width) * sourceScaleX));
      const sourceBottom = Math.min(image.naturalHeight, Math.ceil((bounds.y + bounds.height) * sourceScaleY));
      const contentWidth = Math.max(1, sourceRight - sourceX); const contentHeight = Math.max(1, sourceBottom - sourceY);
      const paddingLeft = Math.ceil(edgePadding.left * sourceScaleX); const paddingTop = Math.ceil(edgePadding.top * sourceScaleY);
      const paddingRight = Math.ceil(edgePadding.right * sourceScaleX); const paddingBottom = Math.ceil(edgePadding.bottom * sourceScaleY);
      const outputWidth = contentWidth + paddingLeft + paddingRight; const outputHeight = contentHeight + paddingTop + paddingBottom;
      const output = document.createElement('canvas'); output.width = outputWidth; output.height = outputHeight;
      const context = output.getContext('2d');
      context.drawImage(image, sourceX, sourceY, contentWidth, contentHeight, paddingLeft, paddingTop, contentWidth, contentHeight);

      const scaledMask = document.createElement('canvas'); scaledMask.width = outputWidth; scaledMask.height = outputHeight;
      const scaledMaskContext = scaledMask.getContext('2d');
      scaledMaskContext.imageSmoothingEnabled = true; scaledMaskContext.imageSmoothingQuality = 'high';
      scaledMaskContext.filter = `blur(${FEATHER_PX}px)`;
      scaledMaskContext.drawImage(alphaMask, bounds.x, bounds.y, bounds.width, bounds.height, paddingLeft, paddingTop, contentWidth, contentHeight);
      context.globalCompositeOperation = 'destination-in'; context.drawImage(scaledMask, 0, 0);

      const paperSeed = paperSeedCanvas(subjectMask, maskWidth, maskHeight);
      const paperEdge = document.createElement('canvas');
      paperEdge.width = bounds.width + edgePadding.left + edgePadding.right;
      paperEdge.height = bounds.height + edgePadding.top + edgePadding.bottom;
      const paperEdgeContext = paperEdge.getContext('2d');
      const paperRadius = Math.max(1, Math.min(bounds.subject.width, bounds.subject.height) * PAPER_WIDTH_RATIO);
      core.buildPaperEdgeOffsets(paperRadius).forEach((offset) => {
        paperEdgeContext.drawImage(paperSeed, bounds.x, bounds.y, bounds.width, bounds.height, edgePadding.left + offset.x, edgePadding.top + offset.y, bounds.width, bounds.height);
      });
      paperEdgeContext.globalCompositeOperation = 'source-in'; paperEdgeContext.fillStyle = '#ffffff';
      paperEdgeContext.fillRect(0, 0, paperEdge.width, paperEdge.height);
      const shadowRadius = Math.max(2, Math.min(outputWidth, outputHeight) * PAPER_WIDTH_RATIO * 0.24);
      context.save(); context.globalCompositeOperation = 'destination-over'; context.shadowColor = 'rgba(0, 0, 0, 0.18)';
      context.shadowBlur = shadowRadius; context.shadowOffsetY = Math.max(1, shadowRadius * 0.45);
      context.drawImage(paperEdge, 0, 0, paperEdge.width, paperEdge.height, 0, 0, outputWidth, outputHeight); context.restore();
      context.globalCompositeOperation = 'source-over';
      return { canvas: output, bounds };
    }

    async function generate(options) {
      const config = options || {};
      if (!config.src) throw new Error('缺少咖啡袋原图');
      notify(config.onStatus, 'reading', '正在读取原图');
      const image = await loadImage(config.src);
      prepareInference(image);
      notify(config.onStatus, 'loading-model', '正在准备本地模型');
      const activeSegmenter = await ensureSegmenter();
      notify(config.onStatus, 'segmenting', '正在识别连续主体');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const started = performance.now();
      const result = activeSegmenter.segment(inferenceCanvas, { keypoint: { x: 0.5, y: 0.5 } });
      const confidenceMask = result.confidenceMasks && result.confidenceMasks[0];
      if (!confidenceMask) { result.close(); throw new Error('本地模型没有返回识别结果'); }
      const rawMask = new Float32Array(confidenceMask.getAsFloat32Array());
      const rendered = render(image, rawMask, confidenceMask.width, confidenceMask.height);
      result.close();
      const output = {
        dataUrl: rendered.canvas.toDataURL('image/png'), width: rendered.canvas.width, height: rendered.canvas.height,
        coverage: rendered.bounds.coverage, inferenceMs: Math.round(performance.now() - started)
      };
      notify(config.onStatus, 'done', `手账封面已生成 · ${output.inferenceMs} ms`);
      return output;
    }

    return { generate };
  }

  return { create };
});
