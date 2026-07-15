// 咖啡袋主体抠图的纯算法：Mask 边界、连通域筛选、羽化和撕纸白边。
// DOM/MediaPipe 调用留在 app-subject-crop.js，本文件可由 Node 直接测试。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SubjectCropCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function assertMaskShape(mask, width, height) {
    if (!mask || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new TypeError('Mask、宽度和高度必须有效');
    }
    if (mask.length !== width * height) {
      throw new RangeError(`Mask 长度 ${mask.length} 与尺寸 ${width}×${height} 不匹配`);
    }
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value < edge0 ? 0 : 1;
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function normalizePoint(point) {
    const source = point || {};
    return {
      x: clamp(Number.isFinite(source.x) ? source.x : 0.5, 0, 1),
      y: clamp(Number.isFinite(source.y) ? source.y : 0.5, 0, 1)
    };
  }

  function computeMaskBounds(mask, width, height, options) {
    assertMaskShape(mask, width, height);
    const config = options || {};
    const threshold = clamp(Number(config.threshold) || 0.5, 0, 1);
    const marginRatio = clamp(Number(config.marginRatio) || 0, 0, 0.5);
    let minX = width; let minY = height; let maxX = -1; let maxY = -1; let selectedPixels = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (mask[y * width + x] < threshold) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); selectedPixels += 1;
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const subjectWidth = maxX - minX + 1;
    const subjectHeight = maxY - minY + 1;
    const margin = Math.round(Math.max(subjectWidth, subjectHeight) * marginRatio);
    const x = Math.max(0, minX - margin); const y = Math.max(0, minY - margin);
    const right = Math.min(width, maxX + margin + 1); const bottom = Math.min(height, maxY + margin + 1);
    return {
      x, y, width: right - x, height: bottom - y,
      subject: { x: minX, y: minY, width: subjectWidth, height: subjectHeight },
      selectedPixels, coverage: selectedPixels / (width * height)
    };
  }

  function computeEdgePadding(bounds, desiredMargin) {
    if (!bounds || !bounds.subject) throw new TypeError('裁切边界和主体边界必须有效');
    const margin = Math.max(0, Math.round(Number(desiredMargin) || 0));
    const subject = bounds.subject;
    return {
      left: Math.max(0, margin - (subject.x - bounds.x)),
      top: Math.max(0, margin - (subject.y - bounds.y)),
      right: Math.max(0, margin - (bounds.x + bounds.width - (subject.x + subject.width))),
      bottom: Math.max(0, margin - (bounds.y + bounds.height - (subject.y + subject.height)))
    };
  }

  function buildAlphaValues(mask, width, height, options) {
    assertMaskShape(mask, width, height);
    const config = options || {};
    const threshold = clamp(Number(config.threshold) || 0.5, 0, 1);
    const softness = clamp(Number(config.softness) || 0, 0, 0.49);
    const alpha = new Uint8ClampedArray(mask.length);
    for (let index = 0; index < mask.length; index += 1) {
      const confidence = clamp(Number(mask[index]) || 0, 0, 1);
      const opacity = softness ? smoothstep(threshold - softness, threshold + softness, confidence) : confidence >= threshold ? 1 : 0;
      alpha[index] = Math.round(opacity * 255);
    }
    return alpha;
  }

  function buildOpaqueAlphaValues(mask, width, height, options) {
    assertMaskShape(mask, width, height);
    const threshold = clamp(Number((options || {}).threshold) || 0.5, 0, 1);
    const alpha = new Uint8ClampedArray(mask.length);
    for (let index = 0; index < mask.length; index += 1) alpha[index] = Number(mask[index]) >= threshold ? 255 : 0;
    return alpha;
  }

  function keepConnectedComponent(mask, width, height, point, options) {
    assertMaskShape(mask, width, height);
    const config = options || {};
    const thresholdValue = Number(config.threshold);
    const threshold = clamp(Number.isFinite(thresholdValue) ? thresholdValue : 0.5, 0, 1);
    const normalizedPoint = normalizePoint(point);
    const seedX = Math.min(width - 1, Math.floor(normalizedPoint.x * width));
    const seedY = Math.min(height - 1, Math.floor(normalizedPoint.y * height));
    const qualifies = (index) => Number(mask[index]) >= threshold;
    let seedIndex = seedY * width + seedX;
    if (!qualifies(seedIndex)) {
      const requestedDistance = Number(config.maxSeedDistance);
      const maxSeedDistance = clamp(Math.round(Number.isFinite(requestedDistance) ? requestedDistance : Math.min(width, height) * 0.12), 0, Math.max(width, height));
      seedIndex = -1;
      for (let radius = 1; radius <= maxSeedDistance && seedIndex < 0; radius += 1) {
        const left = Math.max(0, seedX - radius); const right = Math.min(width - 1, seedX + radius);
        const top = Math.max(0, seedY - radius); const bottom = Math.min(height - 1, seedY + radius);
        for (let x = left; x <= right && seedIndex < 0; x += 1) {
          const topIndex = top * width + x; const bottomIndex = bottom * width + x;
          if (qualifies(topIndex)) seedIndex = topIndex; else if (qualifies(bottomIndex)) seedIndex = bottomIndex;
        }
        for (let y = top + 1; y < bottom && seedIndex < 0; y += 1) {
          const leftIndex = y * width + left; const rightIndex = y * width + right;
          if (qualifies(leftIndex)) seedIndex = leftIndex; else if (qualifies(rightIndex)) seedIndex = rightIndex;
        }
      }
    }
    const connected = new Float32Array(mask.length);
    if (seedIndex < 0) return connected;
    const visited = new Uint8Array(mask.length); const queue = new Int32Array(mask.length);
    let head = 0; let tail = 1; queue[0] = seedIndex; visited[seedIndex] = 1;
    while (head < tail) {
      const index = queue[head]; head += 1; connected[index] = mask[index];
      const x = index % width; const y = Math.floor(index / width);
      for (let nextY = Math.max(0, y - 1); nextY <= Math.min(height - 1, y + 1); nextY += 1) {
        for (let nextX = Math.max(0, x - 1); nextX <= Math.min(width - 1, x + 1); nextX += 1) {
          const nextIndex = nextY * width + nextX;
          if (visited[nextIndex]) continue;
          visited[nextIndex] = 1;
          if (!qualifies(nextIndex)) continue;
          queue[tail] = nextIndex; tail += 1;
        }
      }
    }
    return connected;
  }

  function buildPaperEdgeOffsets(radius, options) {
    const safeRadius = Math.max(0, Number(radius) || 0);
    if (!safeRadius) return [{ x: 0, y: 0 }];
    const config = options || {};
    const requestedSteps = Number(config.steps); const requestedRoughness = Number(config.roughness);
    const steps = clamp(Math.round(Number.isFinite(requestedSteps) ? requestedSteps : 64), 16, 128);
    const roughness = clamp(Number.isFinite(requestedRoughness) ? requestedRoughness : 0.16, 0, 0.4);
    const offsets = [{ x: 0, y: 0 }];
    for (let index = 0; index < steps; index += 1) {
      const angle = (index / steps) * Math.PI * 2;
      const wave = Math.sin(index * 2.399) * 0.58 + Math.sin(index * 5.731 + 0.8) * 0.42;
      const distance = safeRadius * (1 - roughness * 0.5 + wave * roughness * 0.5);
      offsets.push({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance });
    }
    return offsets;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** order);
    return `${value.toFixed(order === 0 ? 0 : 1)} ${units[order]}`;
  }

  return { clamp, smoothstep, normalizePoint, computeMaskBounds, computeEdgePadding, buildAlphaValues, buildOpaqueAlphaValues, keepConnectedComponent, buildPaperEdgeOffsets, formatBytes };
});
